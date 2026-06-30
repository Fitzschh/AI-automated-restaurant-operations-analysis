"""
BPMN Event Gateway Adapter

Thin FastAPI middleware that sits between the UiPath BPMN workflow
and the existing backend, translating all 47+ BPMN HTTP task payloads
into the correct backend API calls.

Runs on port 8080 (behind ngrok tunnel).
Proxies translated requests to the real backend on localhost:5001.

Endpoints:
    POST /event             — Universal event dispatcher (44 BPMN tasks)
    POST /decision/manager  — Manager decision translator (2 tasks)
    POST /decision/admin    — Admin decision translator (2 tasks)
    POST /uipath/callback   — Callback translator (1 task)
    POST /supplier/email    — Supplier email handler (1 task, new)
    GET  /health            — Health check (pass-through)
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from adapter_state import adapter_state

# ─── Configuration ───────────────────────────────────────────────────────────

BACKEND_URL = os.environ.get("ADAPTER_BACKEND_URL", "http://localhost:5001")
ADAPTER_PORT = int(os.environ.get("ADAPTER_PORT", "8080"))
LOG_LEVEL = os.environ.get("ADAPTER_LOG_LEVEL", "INFO")

logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO))
logger = logging.getLogger("bpmn_adapter")

# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="BPMN Event Gateway Adapter",
    description=(
        "Middleware that translates UiPath BPMN HTTP task payloads "
        "into the existing backend's API contracts. "
        "Sits between the ngrok tunnel and the FastAPI backend."
    ),
    version="1.0.0",
)

from logging_middleware import StructuredLoggingMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://.*\.ngrok-free\.dev|https://.*\.web\.app|https://.*\.firebaseapp\.com",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.add_middleware(StructuredLoggingMiddleware)

# ─── Backend HTTP Client ─────────────────────────────────────────────────────


async def backend_request(
    method: str,
    path: str,
    json_body: dict | None = None,
    params: dict | None = None,
) -> dict[str, Any]:
    """Make an HTTP request to the real backend and return parsed JSON."""
    url = f"{BACKEND_URL}{path}"
    logger.info("[Adapter → Backend] %s %s", method, path)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.request(
                method=method,
                url=url,
                json=json_body,
                params=params,
                headers={"Content-Type": "application/json"},
            )

        data = response.json() if response.content else {}

        if response.status_code >= 400:
            logger.warning(
                "[Adapter ← Backend] %s %s → HTTP %d: %s",
                method, path, response.status_code, data,
            )
        else:
            logger.info(
                "[Adapter ← Backend] %s %s → HTTP %d",
                method, path, response.status_code,
            )

        return {
            "status_code": response.status_code,
            "data": data,
            "ok": response.status_code < 400,
        }
    except Exception as exc:
        logger.error("[Adapter → Backend] %s %s FAILED: %s", method, path, exc)
        return {
            "status_code": 502,
            "data": {"error": f"Backend unreachable: {exc}"},
            "ok": False,
        }


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _ack(event_type: str, **extra: Any) -> dict[str, Any]:
    """Return a standard ACK response for BPMN tasks handled internally."""
    return {
        "status": "accepted",
        "event_type": event_type,
        "adapter": True,
        "timestamp": _now_iso(),
        **extra,
    }


# ─── POST /event — Universal Event Dispatcher ───────────────────────────────


@app.post("/event", summary="BPMN universal event dispatcher")
async def handle_event(request: Request) -> JSONResponse:
    """
    Accept all BPMN event payloads and route by event_type.

    The BPMN sends payloads shaped like:
        { "event": { "agent_type": "...", "event_type": "...", ... } }

    This dispatcher routes based on (agent_type, event_type) and either:
    - Accumulates context for later batching (analyst/manager steps)
    - ACKs persistence tasks the backend handles internally
    - Proxies to the real backend where needed
    """
    body = await request.json()
    event = body.get("event", body)

    agent_type = event.get("agent_type", "")
    event_type = event.get("event_type", "")
    branch_id = event.get("branch_id", "")
    timestamp = event.get("timestamp", _now_iso())

    logger.info(
        "[BPMN → Adapter] POST /event agent_type=%s event_type=%s branch_id=%s",
        agent_type, event_type, branch_id,
    )

    # ── If no event_type, this might be a legacy/direct backend call ──
    if not event_type:
        return await _handle_legacy_event(body, event, agent_type)

    # ── Route by agent_type + event_type ─────────────────────────────
    handler = EVENT_HANDLERS.get(event_type)
    if handler:
        result = await handler(event, branch_id, timestamp)
        return JSONResponse(content=result, status_code=200)

    # Unknown event_type — log and ACK to avoid BPMN failure
    logger.warning("[Adapter] Unknown event_type: %s (agent_type: %s)", event_type, agent_type)
    return JSONResponse(
        content=_ack(event_type, warning=f"Unknown event_type '{event_type}' — accepted but no action taken"),
        status_code=200,
    )


async def _handle_legacy_event(body: dict, event: dict, agent_type: str) -> JSONResponse:
    """
    Handle events without event_type — these might be direct backend-format payloads.
    Remap agent_type if needed and proxy to backend.
    """
    # Fix agent_type enum mismatch
    if agent_type == "LIVE_OPS_ANALYST":
        event["agent_type"] = "LIVE_OPERATIONS_ANALYST"
        body["event"] = event

    result = await backend_request("POST", "/event", json_body=body)
    return JSONResponse(content=result["data"], status_code=result["status_code"])


# ─── Analyst Lane Handlers (LIVE_OPS_ANALYST) ───────────────────────────────


async def _handle_subscribe_firebase(event: dict, branch_id: str, ts: str) -> dict:
    """SUBSCRIBE_FIREBASE — Store context, ACK."""
    await adapter_state.update_cycle(branch_id, {
        "firebase_subscribed": True,
        "subscribe_timestamp": ts,
    })
    return _ack("SUBSCRIBE_FIREBASE", branch_id=branch_id)


async def _handle_compute_velocity(event: dict, branch_id: str, ts: str) -> dict:
    """COMPUTE_VELOCITY — Store velocity data, ACK."""
    await adapter_state.update_cycle(branch_id, {
        "velocity_data": event.get("velocity_data", event),
    })
    return _ack("COMPUTE_VELOCITY", branch_id=branch_id)


async def _handle_forecast_depletion(event: dict, branch_id: str, ts: str) -> dict:
    """FORECAST_DEPLETION — Store forecast with item_key and hours_remaining, ACK."""
    cycle = await adapter_state.get_cycle(branch_id)
    predictions = cycle.get("predictions", [])

    # The BPMN sends per-item forecasts
    item_key = event.get("item_key", "")
    hours_remaining = event.get("hours_remaining", 999)

    predictions.append({
        "item_key": item_key,
        "item_name": event.get("item_name", item_key),
        "current_stock": event.get("current_stock", 0),
        "sales_velocity_per_hour": event.get("sales_velocity_per_hour", 0),
        "estimated_hours_remaining": hours_remaining,
        "prediction": event.get("prediction", f"{item_key} forecast: {hours_remaining}h remaining"),
    })

    await adapter_state.update_cycle(branch_id, {
        "depletion_forecast": event,
        "predictions": predictions,
    })
    return _ack("FORECAST_DEPLETION", branch_id=branch_id, item_key=item_key)


async def _handle_build_prediction(event: dict, branch_id: str, ts: str) -> dict:
    """
    BUILD_PREDICTION — Assemble accumulated predictions into a single
    LIVE_OPERATIONS_ANALYST event and POST to the real backend.
    """
    cycle = await adapter_state.get_cycle(branch_id)
    predictions = cycle.get("predictions", [])

    if not predictions:
        # If BPMN provides predictions directly in the event, use those
        predictions = event.get("predictions", [])

    backend_payload = {
        "event": {
            "agent_type": "LIVE_OPERATIONS_ANALYST",
            "timestamp": ts,
            "branch_id": branch_id,
            "predictions": predictions,
            "operational_note": event.get("operational_note", ""),
        }
    }

    result = await backend_request("POST", "/event", json_body=backend_payload)

    # Store response in cycle state
    await adapter_state.update_cycle(branch_id, {
        "analyst_response": result.get("data"),
    })

    return {
        **_ack("BUILD_PREDICTION", branch_id=branch_id),
        "backend_response": result.get("data"),
        "predictions_sent": len(predictions),
    }


# ─── Operations Manager Lane Handlers ───────────────────────────────────────


async def _handle_classify_severity(event: dict, branch_id: str, ts: str) -> dict:
    """CLASSIFY_SEVERITY — Store severity classification, ACK."""
    cycle = await adapter_state.get_cycle(branch_id)
    classifications = cycle.get("severity_classifications", [])
    classifications.append(event)

    await adapter_state.update_cycle(branch_id, {
        "severity_classifications": classifications,
        "severity": event.get("severity", "LOW"),
    })
    return _ack("CLASSIFY_SEVERITY", branch_id=branch_id, severity=event.get("severity"))


async def _handle_generate_action_plans(event: dict, branch_id: str, ts: str) -> dict:
    """GENERATE_ACTION_PLANS — Store action plans, ACK."""
    cycle = await adapter_state.get_cycle(branch_id)
    plans = cycle.get("action_plans", [])
    plans.append(event)

    await adapter_state.update_cycle(branch_id, {
        "action_plans": plans,
        "action_plan": event.get("action_plan", ""),
    })
    return _ack("GENERATE_ACTION_PLANS", branch_id=branch_id)


async def _handle_compute_revenue(event: dict, branch_id: str, ts: str) -> dict:
    """COMPUTE_REVENUE — Store revenue metrics, ACK."""
    await adapter_state.update_cycle(branch_id, {
        "revenue_metrics": event.get("revenue_metrics", event),
    })
    return _ack("COMPUTE_REVENUE", branch_id=branch_id)


async def _handle_build_manager_output(event: dict, branch_id: str, ts: str) -> dict:
    """
    BUILD_MANAGER_OUTPUT — Assemble accumulated severity classifications
    and action plans into a single OPERATIONS_MANAGER event and POST to backend.
    """
    cycle = await adapter_state.get_cycle(branch_id)

    # Build assessments from accumulated data
    assessments = []
    for classification in cycle.get("severity_classifications", []):
        item_key = classification.get("item_key", "")
        severity = classification.get("severity", "LOW")
        is_high = severity == "HIGH"

        # Find matching action plan
        action_plan = None
        for plan in cycle.get("action_plans", []):
            if plan.get("item_key") == item_key:
                action_plan = plan.get("action_plan", "")
                break

        assessments.append({
            "item_key": item_key,
            "item_name": classification.get("item_name", item_key),
            "issue": classification.get("issue", f"{item_key} requires attention"),
            "severity": severity,
            "hours_remaining": classification.get("hours_remaining", 999),
            "current_stock": classification.get("current_stock", 0),
            "sales_velocity_per_hour": classification.get("sales_velocity_per_hour", 0),
            "action_plan": action_plan,
            "approval_required": is_high,
        })

    # If no accumulated assessments, try the event payload directly
    if not assessments:
        assessments = event.get("assessments", [])

    backend_payload = {
        "event": {
            "agent_type": "OPERATIONS_MANAGER",
            "timestamp": ts,
            "branch_id": branch_id,
            "assessments": assessments,
        }
    }

    # Add revenue analysis if available
    revenue = cycle.get("revenue_metrics")
    if revenue and isinstance(revenue, dict):
        backend_payload["event"]["revenue_analysis"] = revenue

    result = await backend_request("POST", "/event", json_body=backend_payload)

    # Store response and workflow context
    response_data = result.get("data", {})
    await adapter_state.update_cycle(branch_id, {
        "event_response": response_data,
        "assessments": assessments,
    })

    # If the backend created workflows, track them
    workflows_created = response_data.get("workflows_created", 0)
    if workflows_created > 0:
        # Fetch the latest workflow to get its ID
        wf_result = await backend_request(
            "GET", "/workflows",
            params={"branch_id": branch_id, "status": "PENDING_MANAGER"},
        )
        if wf_result["ok"]:
            workflows = wf_result["data"].get("workflows", [])
            if workflows:
                latest_wf = workflows[0]
                wf_id = latest_wf.get("workflow_id", "")
                await adapter_state.update_cycle(branch_id, {
                    "workflow_id": wf_id,
                    "item_key": latest_wf.get("item_key"),
                    "item_name": latest_wf.get("item_name"),
                })
                # Also store in workflow-level state
                await adapter_state.set_workflow(wf_id, {
                    "branch_id": branch_id,
                    "item_key": latest_wf.get("item_key"),
                    "item_name": latest_wf.get("item_name"),
                    "severity": latest_wf.get("severity"),
                    "action_plan": latest_wf.get("action_plan"),
                    "hours_remaining": latest_wf.get("hours_remaining"),
                    "status": "PENDING_MANAGER",
                })

    return {
        **_ack("BUILD_MANAGER_OUTPUT", branch_id=branch_id),
        "backend_response": response_data,
        "assessments_sent": len(assessments),
        "workflows_created": workflows_created,
    }


# ─── Dispatch Handler ───────────────────────────────────────────────────────


async def _handle_dispatch(event: dict, branch_id: str, ts: str) -> dict:
    """
    Generic OPERATIONS_MANAGER dispatch — the spec-exact POST /event call.
    Forward to backend with proper agent_type.
    """
    backend_payload = {
        "event": {
            "agent_type": "OPERATIONS_MANAGER",
            "timestamp": ts,
            "branch_id": branch_id,
            "assessments": event.get("assessments", []),
        }
    }
    result = await backend_request("POST", "/event", json_body=backend_payload)
    await adapter_state.update_cycle(branch_id, {"event_response": result.get("data")})
    return {
        **_ack("DISPATCH", branch_id=branch_id),
        "backend_response": result.get("data"),
    }


# ─── Backend Persistence Handlers (agent_type: BACKEND) ─────────────────────
# Most of these are ACK-only because the backend handles persistence
# atomically inside its own workflow_engine when decisions are made.


async def _handle_ack_only(event: dict, branch_id: str, ts: str) -> dict:
    """Generic ACK handler for BACKEND tasks the real backend handles internally."""
    event_type = event.get("event_type", "UNKNOWN")

    # Extract and store any useful context from the payload
    workflow_id = event.get("workflow_id")
    status = event.get("status")
    if workflow_id and status:
        await adapter_state.update_workflow(workflow_id, {"status": status})

    return _ack(event_type, branch_id=branch_id, note="Handled internally by backend")


async def _handle_create_workflow_record(event: dict, branch_id: str, ts: str) -> dict:
    """
    CREATE_WORKFLOW_RECORD — The backend auto-creates workflows when a
    HIGH severity assessment is POSTed via /event. ACK and store context.
    """
    workflow_id = event.get("workflow_id")
    status = event.get("status", "PENDING_MANAGER")

    if workflow_id:
        await adapter_state.set_workflow(workflow_id, {
            "branch_id": branch_id,
            "status": status,
            "item_key": event.get("item_key"),
            "item_name": event.get("item_name"),
            "severity": event.get("severity"),
            "action_plan": event.get("action_plan"),
        })
        await adapter_state.update_cycle(branch_id, {"workflow_id": workflow_id})

    return _ack("CREATE_WORKFLOW_RECORD", branch_id=branch_id, workflow_id=workflow_id)


async def _handle_update_workflow(event: dict, branch_id: str, ts: str) -> dict:
    """
    UPDATE_WORKFLOW — The backend updates workflow status atomically when
    decisions are posted. Store the intended status for context.
    """
    workflow_id = event.get("workflow_id")
    status = event.get("status")

    if workflow_id:
        await adapter_state.update_workflow(workflow_id, {"status": status})
    else:
        # Try to find workflow from cycle state
        cycle = await adapter_state.get_cycle(branch_id)
        wf_id = cycle.get("workflow_id")
        if wf_id:
            await adapter_state.update_workflow(wf_id, {"status": status})

    return _ack("UPDATE_WORKFLOW", branch_id=branch_id, status=status)


async def _handle_lookup_supplier(event: dict, branch_id: str, ts: str) -> dict:
    """LOOKUP_SUPPLIER — Fetch suppliers from backend and store in context."""
    result = await backend_request("GET", "/suppliers")

    suppliers = result["data"].get("suppliers", []) if result["ok"] else []
    supplier = suppliers[0] if suppliers else {}

    # Store supplier info in cycle state
    await adapter_state.update_cycle(branch_id, {
        "supplier_email": supplier.get("email", ""),
        "supplier_name": supplier.get("name", ""),
        "supplier_id": supplier.get("supplier_id", ""),
    })

    # Also store in workflow-level state if we have a workflow_id
    cycle = await adapter_state.get_cycle(branch_id)
    wf_id = cycle.get("workflow_id")
    if wf_id:
        await adapter_state.update_workflow(wf_id, {
            "supplier_email": supplier.get("email", ""),
            "supplier_name": supplier.get("name", ""),
        })

    return {
        **_ack("LOOKUP_SUPPLIER", branch_id=branch_id),
        "supplier": supplier,
        "suppliers_found": len(suppliers),
    }


# ─── UiPath Maestro Lane Handlers ───────────────────────────────────────────


async def _handle_retrieve_supplier(event: dict, branch_id: str, ts: str) -> dict:
    """RETRIEVE_SUPPLIER — Same as LOOKUP_SUPPLIER but from UiPath Maestro lane."""
    return await _handle_lookup_supplier(event, branch_id, ts)


async def _handle_compose_email(event: dict, branch_id: str, ts: str) -> dict:
    """COMPOSE_EMAIL — Store the composed email body for the /supplier/email call."""
    await adapter_state.update_cycle(branch_id, {
        "composed_email": {
            "subject": event.get("subject", ""),
            "body": event.get("body", ""),
            "item_name": event.get("item_name", ""),
            "branch_id": branch_id,
            "restock_amount": event.get("restock_amount"),
            "action_plan": event.get("action_plan", ""),
        },
    })
    return _ack("COMPOSE_EMAIL", branch_id=branch_id)


async def _handle_process_supplier_response(event: dict, branch_id: str, ts: str) -> dict:
    """PROCESS_SUPPLIER_RESPONSE — Store supplier decision for the callback."""
    supplier_decision = event.get("supplier_decision", event.get("decision", ""))
    supplier_notes = event.get("supplier_notes", event.get("notes", ""))

    await adapter_state.update_cycle(branch_id, {
        "supplier_decision": supplier_decision,
        "supplier_notes": supplier_notes,
    })

    cycle = await adapter_state.get_cycle(branch_id)
    wf_id = cycle.get("workflow_id")
    if wf_id:
        await adapter_state.update_workflow(wf_id, {
            "supplier_decision": supplier_decision,
            "supplier_notes": supplier_notes,
        })

    return _ack("PROCESS_SUPPLIER_RESPONSE", branch_id=branch_id, decision=supplier_decision)


# ─── Post-Completion Handlers ────────────────────────────────────────────────


async def _handle_increase_inventory(event: dict, branch_id: str, ts: str) -> dict:
    """INCREASE_INVENTORY — ACK (inventory managed by frontend/Firebase RTDB)."""
    restock_amount = event.get("restock_amount", 10)
    return _ack(
        "INCREASE_INVENTORY",
        branch_id=branch_id,
        restock_amount=restock_amount,
        note="Inventory update recorded; actual update via Firebase RTDB",
    )


async def _handle_broadcast_completion(event: dict, branch_id: str, ts: str) -> dict:
    """BROADCAST_COMPLETION — ACK and reset cycle."""
    await adapter_state.reset_cycle(branch_id)
    return _ack("BROADCAST_COMPLETION", branch_id=branch_id, note="Cycle complete, state reset")


# ─── Event Handler Registry ─────────────────────────────────────────────────

EVENT_HANDLERS: dict[str, Any] = {
    # Analyst lane
    "SUBSCRIBE_FIREBASE": _handle_subscribe_firebase,
    "COMPUTE_VELOCITY": _handle_compute_velocity,
    "FORECAST_DEPLETION": _handle_forecast_depletion,
    "BUILD_PREDICTION": _handle_build_prediction,

    # Operations Manager lane
    "CLASSIFY_SEVERITY": _handle_classify_severity,
    "GENERATE_ACTION_PLANS": _handle_generate_action_plans,
    "COMPUTE_REVENUE": _handle_compute_revenue,
    "BUILD_MANAGER_OUTPUT": _handle_build_manager_output,

    # Backend persistence — ACK-only (backend handles internally)
    "CREATE_DASHBOARD_NOTIFICATION": _handle_ack_only,
    "STORE_NOTIFICATION": _handle_ack_only,
    "CREATE_WORKFLOW_RECORD": _handle_create_workflow_record,
    "CREATE_APPROVAL_NOTIFICATION": _handle_ack_only,
    "CREATE_INBOX_ENTRY": _handle_ack_only,
    "UPDATE_WORKFLOW": _handle_update_workflow,
    "CREATE_REJECTION_NOTIFICATION": _handle_ack_only,
    "CREATE_ESCALATION_NOTIFICATION": _handle_ack_only,
    "CLEAR_TOAST": _handle_ack_only,
    "CREATE_UIPATH_NOTIFICATION": _handle_ack_only,
    "LOOKUP_SUPPLIER": _handle_lookup_supplier,
    "TRIGGER_UIPATH_MAESTRO": _handle_ack_only,
    "RECORD_UIPATH_JOB_ID": _handle_ack_only,
    "CREATE_COMPLETION_NOTIFICATION": _handle_ack_only,

    # UiPath Maestro lane
    "RETRIEVE_SUPPLIER": _handle_retrieve_supplier,
    "COMPOSE_EMAIL": _handle_compose_email,
    "PROCESS_SUPPLIER_RESPONSE": _handle_process_supplier_response,

    # Post-completion
    "INCREASE_INVENTORY": _handle_increase_inventory,
    "BROADCAST_COMPLETION": _handle_broadcast_completion,
}


# ─── POST /decision/manager — Manager Decision Translator ───────────────────


@app.post("/decision/manager", summary="BPMN manager decision translator")
async def handle_manager_decision(request: Request) -> JSONResponse:
    """
    Translate the BPMN's minimal manager decision payload into the
    full ManagerDecisionPayload required by the backend.

    BPMN sends:  { decision: "APPROVED" }
    Backend needs: { branch_id, item_key, decision, decided_by, notes }
    """
    body = await request.json()
    decision = body.get("decision", "")
    notes = body.get("notes")

    # Extract decided_by from HITL result or payload
    decided_by = (
        body.get("decided_by")
        or body.get("DecidedBy")
        or body.get("manager_email")
        or body.get("ManagerEmail")
        or "branch-manager@restaurant.com"
    )

    # Find context — try workflow_id first, then branch_id
    workflow_id = body.get("workflow_id") or body.get("WorkflowId")
    branch_id = body.get("branch_id") or body.get("BranchId")
    item_key = body.get("item_key") or body.get("ItemKey")

    # Resolve missing fields from adapter state
    if workflow_id:
        wf_state = await adapter_state.get_workflow(workflow_id)
        if wf_state:
            branch_id = branch_id or wf_state.get("branch_id")
            item_key = item_key or wf_state.get("item_key")

    if branch_id and not item_key:
        cycle = await adapter_state.get_cycle(branch_id)
        item_key = item_key or cycle.get("item_key")
        workflow_id = workflow_id or cycle.get("workflow_id")

    if not branch_id or not item_key:
        # Last resort: try to find from any tracked workflow
        logger.warning(
            "[Adapter] Manager decision missing context. "
            "branch_id=%s item_key=%s workflow_id=%s",
            branch_id, item_key, workflow_id,
        )
        return JSONResponse(
            content={
                "error": "Cannot resolve branch_id and item_key for manager decision",
                "hint": "Include branch_id + item_key or workflow_id in the payload",
                "received": body,
            },
            status_code=422,
        )

    # Build the full backend payload
    backend_payload = {
        "branch_id": branch_id,
        "item_key": item_key,
        "decision": decision,
        "decided_by": decided_by,
        "notes": notes,
    }

    logger.info(
        "[Adapter] Manager decision: %s for %s/%s by %s",
        decision, branch_id, item_key, decided_by,
    )

    result = await backend_request("POST", "/decision/manager", json_body=backend_payload)

    # Store decision context
    if branch_id:
        await adapter_state.update_cycle(branch_id, {
            "manager_decision": decision,
            "manager_notes": notes,
            "manager_email": decided_by,
        })
    if workflow_id:
        new_status = "PENDING_ADMIN" if decision == "APPROVED" else "MANAGER_REJECTED"
        await adapter_state.update_workflow(workflow_id, {
            "status": new_status,
            "manager_decision": decision,
            "manager_email": decided_by,
        })

    return JSONResponse(
        content=result["data"],
        status_code=result["status_code"],
    )


# ─── POST /decision/admin — Admin Decision Translator ───────────────────────


@app.post("/decision/admin", summary="BPMN admin decision translator")
async def handle_admin_decision(request: Request) -> JSONResponse:
    """
    Translate the BPMN's minimal admin decision payload into the
    full AdminDecisionPayload required by the backend.

    BPMN sends:  { decision: "APPROVED" }
    Backend needs: { workflow_id, decision, decided_by, notes }
    """
    body = await request.json()
    decision = body.get("decision", "")
    notes = body.get("notes")

    decided_by = (
        body.get("decided_by")
        or body.get("DecidedBy")
        or body.get("admin_email")
        or body.get("AdminEmail")
        or "admin@restaurant.com"
    )

    workflow_id = body.get("workflow_id") or body.get("WorkflowId")
    branch_id = body.get("branch_id") or body.get("BranchId")

    # Resolve workflow_id from adapter state if not in payload
    if not workflow_id and branch_id:
        cycle = await adapter_state.get_cycle(branch_id)
        workflow_id = cycle.get("workflow_id")

    if not workflow_id:
        # Try to find any PENDING_ADMIN workflow
        if branch_id:
            wf = await adapter_state.find_workflow_by_branch(branch_id, "PENDING_ADMIN")
            if wf:
                workflow_id = wf.get("workflow_id")

    if not workflow_id:
        logger.warning("[Adapter] Admin decision missing workflow_id. body=%s", body)
        return JSONResponse(
            content={
                "error": "Cannot resolve workflow_id for admin decision",
                "hint": "Include workflow_id or branch_id in the payload",
                "received": body,
            },
            status_code=422,
        )

    backend_payload = {
        "workflow_id": workflow_id,
        "decision": decision,
        "decided_by": decided_by,
        "notes": notes,
    }

    logger.info(
        "[Adapter] Admin decision: %s for workflow %s by %s",
        decision, workflow_id, decided_by,
    )

    result = await backend_request("POST", "/decision/admin", json_body=backend_payload)

    # Store decision context
    if branch_id:
        await adapter_state.update_cycle(branch_id, {
            "admin_decision": decision,
            "admin_notes": notes,
            "admin_email": decided_by,
        })
    if workflow_id:
        new_status = "PENDING_UIPATH" if decision == "APPROVED" else "ADMIN_REJECTED"
        await adapter_state.update_workflow(workflow_id, {
            "status": new_status,
            "admin_decision": decision,
            "admin_email": decided_by,
        })

    return JSONResponse(
        content=result["data"],
        status_code=result["status_code"],
    )


# ─── POST /uipath/callback — Callback Translator ────────────────────────────


@app.post("/uipath/callback", summary="BPMN UiPath callback translator")
async def handle_uipath_callback(request: Request) -> JSONResponse:
    """
    Translate the BPMN's callback payload by adding the missing job_id field.

    BPMN sends:  { workflow_id, supplier_status, supplier_notes, responded_at }
    Backend needs: { workflow_id, job_id, supplier_status, supplier_notes, responded_at }
    """
    body = await request.json()
    workflow_id = body.get("workflow_id", body.get("WorkflowId", ""))
    supplier_status = body.get("supplier_status", body.get("SupplierStatus", ""))
    supplier_notes = body.get("supplier_notes", body.get("SupplierNotes"))
    responded_at = body.get("responded_at", body.get("RespondedAt", _now_iso()))

    # Resolve job_id from adapter state or use a fallback
    job_id = body.get("job_id", body.get("JobId"))
    if not job_id:
        wf_state = await adapter_state.get_workflow(workflow_id)
        if wf_state:
            job_id = wf_state.get("uipath_job_id")
        if not job_id:
            # Fallback — the backend needs a non-empty string
            job_id = f"bpmn_{workflow_id}"

    backend_payload = {
        "workflow_id": workflow_id,
        "job_id": job_id,
        "supplier_status": supplier_status,
        "supplier_notes": supplier_notes,
        "responded_at": responded_at,
    }

    logger.info(
        "[Adapter] UiPath callback: workflow=%s status=%s job=%s",
        workflow_id, supplier_status, job_id,
    )

    result = await backend_request("POST", "/uipath/callback", json_body=backend_payload)

    if workflow_id:
        final_status = "COMPLETED" if supplier_status == "APPROVED" else "SUPPLIER_REJECTED"
        await adapter_state.update_workflow(workflow_id, {
            "status": final_status,
            "supplier_decision": supplier_status,
        })

    return JSONResponse(
        content=result["data"],
        status_code=result["status_code"],
    )


# ─── POST /supplier/email — Supplier Email Handler ──────────────────────────


@app.post("/supplier/email", summary="Supplier restock email (adapter-handled)")
async def handle_supplier_email(request: Request) -> JSONResponse:
    """
    Handle the BPMN's POST /supplier/email call.
    This endpoint doesn't exist in the backend — the adapter handles it directly.

    Logs the email and returns success. Actual email sending is a future integration.
    """
    body = await request.json()

    supplier_email = body.get("supplier_email", body.get("SupplierEmail", ""))
    supplier_name = body.get("supplier_name", body.get("SupplierName", ""))
    subject = body.get("subject", body.get("Subject", ""))
    email_body = body.get("body", body.get("Body", ""))
    item_name = body.get("item_name", body.get("ItemName", ""))
    branch_id = body.get("branch_id", body.get("BranchId", ""))
    restock_amount = body.get("restock_amount", body.get("RestockAmount", 10))

    logger.info(
        "[Adapter] Supplier email: to=%s subject='%s' item=%s amount=%s",
        supplier_email, subject, item_name, restock_amount,
    )

    # Store in cycle state for audit
    if branch_id:
        await adapter_state.update_cycle(branch_id, {
            "email_sent": True,
            "email_details": {
                "to": supplier_email,
                "supplier_name": supplier_name,
                "subject": subject,
                "body": email_body,
                "item_name": item_name,
                "restock_amount": restock_amount,
                "sent_at": _now_iso(),
            },
        })

    return JSONResponse(
        content={
            "status": "sent",
            "supplier_email": supplier_email,
            "subject": subject,
            "item_name": item_name,
            "restock_amount": restock_amount,
            "timestamp": _now_iso(),
            "note": "Email logged by adapter. Actual delivery is a future integration.",
        },
        status_code=200,
    )


# ─── Passthrough Routes ─────────────────────────────────────────────────────


@app.get("/health", summary="Health check")
async def health_check() -> dict:
    """Health check — also checks backend connectivity."""
    backend_health = await backend_request("GET", "/health")
    adapter_stats = await adapter_state.get_stats()

    return {
        "status": "ok",
        "adapter": True,
        "adapter_port": ADAPTER_PORT,
        "backend_url": BACKEND_URL,
        "backend_healthy": backend_health["ok"],
        "state": adapter_stats,
        "timestamp": _now_iso(),
    }


@app.get("/adapter/state", summary="Adapter state inspection")
async def get_adapter_state() -> dict:
    """Inspect the adapter's internal state (debug/monitoring)."""
    return await adapter_state.get_stats()


# ─── Catch-all passthrough for any unmatched routes ──────────────────────────


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def passthrough(request: Request, path: str) -> JSONResponse:
    """
    Forward any unmatched routes directly to the backend.
    This ensures the adapter doesn't break any existing API calls.
    """
    body = None
    if request.method in ("POST", "PUT", "PATCH"):
        try:
            body = await request.json()
        except Exception:
            body = None

    params = dict(request.query_params)
    result = await backend_request(request.method, f"/{path}", json_body=body, params=params)

    return JSONResponse(
        content=result["data"],
        status_code=result["status_code"],
    )


# ─── Run ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    logger.info(
        "Starting BPMN Event Gateway Adapter on port %d → backend at %s",
        ADAPTER_PORT, BACKEND_URL,
    )
    uvicorn.run("bpmn_adapter:app", host="0.0.0.0", port=ADAPTER_PORT, reload=True)
