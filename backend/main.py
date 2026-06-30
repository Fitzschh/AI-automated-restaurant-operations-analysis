from __future__ import annotations

import os
import sys
import shutil

# --- Startup Environment Initialization ---
def _init_env():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(base_dir, "..", ".env")
    example_path = os.path.join(base_dir, "..", ".env.example")
    
    if os.path.exists(example_path):
        if not os.path.exists(env_path):
            shutil.copy(example_path, env_path)
        else:
            existing_keys = set()
            with open(env_path, "r") as f:
                for line in f:
                    stripped = line.strip()
                    if stripped and not stripped.startswith("#") and "=" in stripped:
                        existing_keys.add(stripped.split("=", 1)[0].strip())
            
            missing_lines = []
            with open(example_path, "r") as f:
                for line in f:
                    stripped = line.strip()
                    if stripped and not stripped.startswith("#") and "=" in stripped:
                        key = stripped.split("=", 1)[0].strip()
                        if key not in existing_keys:
                            missing_lines.append(line)
                            
            if missing_lines:
                with open(env_path, "a") as f:
                    f.write("\n# Auto-merged from .env.example\n")
                    f.writelines(missing_lines)

    # Load dotenv using absolute path so it works regardless of cwd
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=env_path, override=False)

    # Set EVENT_GATEWAY_PUBLIC_URL to active ngrok URL if running
    import urllib.request
    import json
    try:
        req = urllib.request.Request("http://127.0.0.1:4040/api/tunnels")
        with urllib.request.urlopen(req, timeout=1) as response:
            data = json.loads(response.read().decode())
            for tunnel in data.get("tunnels", []):
                if tunnel.get("public_url", "").startswith("https://"):
                    os.environ["EVENT_GATEWAY_PUBLIC_URL"] = tunnel["public_url"]
                    break
    except Exception:
        pass

_init_env()

"""
AI Operations Event Gateway — FastAPI Application

Event-driven gateway between React frontend agents and
UiPath Orchestrator (future integration).

Endpoints:
    POST /event     — Receive validated agent outputs
    GET  /events    — Retrieve latest processed states
    POST /decision  — Receive human approval/rejection
    GET  /health    — Health check
    GET  /stats     — Store statistics
"""

import logging
import os
from datetime import datetime

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from schemas import (
    AgentTypeEnum,
    Assessment,
    DecisionPayload,
    EventPayload,
    EventResponse,
    HealthResponse,
    LiveAnalystEvent,
    OpsManagerEvent,
    SeverityEnum,
)
from event_store import event_store
from ai_analysis import router as ai_analysis_router
from routes_suppliers import router as suppliers_router
from routes_workflows import router as workflows_router
from workflow_engine import workflow_engine

# ─── Logging ─────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("event_gateway")

# ─── Startup Environment Validation ─────────────────────────────────────────

def validate_environment():
    """
    Validate required environment variables at startup.
    Logs configuration status and specific missing variables, but allows startup to continue.
    """
    issues = False
    warnings = []

    # ── OPENAI_API_KEY (REQUIRED) ────────────────────────────────────────
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        logger.error("✗ OPENAI_API_KEY is not set. AI analysis will not work.")
        issues = True
    elif api_key == "your_openai_api_key_here":
        logger.error("✗ OPENAI_API_KEY contains the placeholder value. Replace it with a valid key.")
        issues = True
    else:
        # Log only a safe prefix to confirm key is loaded
        masked = f"{api_key[:8]}...{api_key[-4:]}"
        logger.info("✓ OPENAI_API_KEY configured (%s)", masked)

    # ── OPENAI_MODEL ─────────────────────────────────────────────────────
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini").strip()
    logger.info("✓ OPENAI_MODEL: %s", model)

    # ── GOOGLE_CLOUD_PROJECT (REQUIRED for Firebase Auth) ────────────────
    project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip()
    if not project_id:
        warnings.append("GOOGLE_CLOUD_PROJECT is not set. Firebase Auth verification may fail.")
    else:
        logger.info("✓ GOOGLE_CLOUD_PROJECT: %s", project_id)

    # ── FIREBASE_DATABASE_URL (OPTIONAL — usage tracking) ────────────────
    db_url = os.environ.get("FIREBASE_DATABASE_URL", "").strip()
    if db_url:
        logger.info("✓ FIREBASE_DATABASE_URL configured")
    else:
        logger.info("⊘ FIREBASE_DATABASE_URL not set — AI usage tracking disabled")

    # ── UiPath Integration (Backend only) ──────────────────────────────────
    from uipath_client import uipath_client
    
    uipath_vars = {
        "UIPATH_CLOUD_URL": uipath_client.cloud_url,
        "UIPATH_ACCOUNT_NAME": uipath_client.account_name,
        "UIPATH_TENANT_NAME": uipath_client.tenant_name,
        "UIPATH_CLIENT_ID": uipath_client.client_id,
        "UIPATH_CLIENT_SECRET": uipath_client.client_secret,
        "UIPATH_PROCESS_RELEASE_KEY": uipath_client.release_key,
        "UIPATH_FOLDER_ID": uipath_client.folder_id,
        "EVENT_GATEWAY_PUBLIC_URL": uipath_client.public_url,
    }

    uipath_ready = True
    for key, val in uipath_vars.items():
        if not val:
            logger.error("✗ %s is missing.", key)
            uipath_ready = False
            issues = True
        elif val.startswith("your_"):
            logger.error("✗ %s contains the placeholder value. Replace it with a valid value.", key)
            uipath_ready = False
            issues = True

    if uipath_ready:
        logger.info("✓ UIPATH configured (Simulation Mode: OFF)")
        logger.info("✓ EVENT_GATEWAY_PUBLIC_URL: %s", uipath_client.public_url)
    else:
        logger.warning("⊘ UIPATH not fully configured — running in Simulation Mode")

    # ── Report issues ────────────────────────────────────────────────────
    for w in warnings:
        logger.warning("⚠ %s", w)

    if issues:
        logger.error("─── STARTUP COMPLETED WITH CONFIGURATION ISSUES ───")
    else:
        logger.info("─── Environment validation passed ───")

validate_environment()


# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="AI Operations Event Gateway",
    description=(
        "Event-driven gateway for the restaurant AI operations system. "
        "Receives agent outputs, stores latest states per item, and "
        "handles human approval decisions. Designed for UiPath integration."
    ),
    version="1.0.0",
)

from logging_middleware import StructuredLoggingMiddleware

# CORS — allow the React frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://.*\.ngrok-free\.dev|https://.*\.web\.app|https://.*\.firebaseapp\.com",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Structured Logging Middleware
app.add_middleware(StructuredLoggingMiddleware)

# ─── Global Exception Handler ───────────────────────────────────────────────

@app.exception_handler(StarletteHTTPException)
async def starlette_exception_handler(request: Request, exc: StarletteHTTPException):
    """Return all HTTP errors (including framework-level 404/405) as structured JSON."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "code": f"HTTP_{exc.status_code}",
            "details": None,
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Catch-all for unhandled exceptions.
    Ensures the server never returns a raw 500 traceback.
    """
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error": "An unexpected internal error occurred.",
            "code": "INTERNAL_SERVER_ERROR",
            "details": str(exc) if os.environ.get("DEBUG") else None,
        },
    )


# Register routers
app.include_router(ai_analysis_router)
app.include_router(suppliers_router)
app.include_router(workflows_router)


# ─── POST /event ─────────────────────────────────────────────────────────────

@app.post("/event", summary="Receive agent output events")
async def receive_event(payload: EventPayload) -> dict:
    """
    Receive and process an agent output event.

    The event is validated by Pydantic, then stored in the event store.
    Latest state per (branch_id, item_key) is maintained — old states
    are overwritten, not stacked.

    Accepts events from:
    - LIVE_OPERATIONS_ANALYST: inventory depletion predictions
    - OPERATIONS_MANAGER: severity-classified assessments
    """
    event = payload.event
    branch_id = event.branch_id
    agent_type = event.agent_type

    logger.info(
        "Received %s event for branch %s with %d items",
        agent_type,
        branch_id,
        _count_items(event),
    )

    if isinstance(event, LiveAnalystEvent):
        items = [
            {
                "item_key": pred.item_key,
                "agent_type": agent_type,
                "severity": None,
                "state": pred.model_dump(mode="json"),
            }
            for pred in event.predictions
        ]
    elif isinstance(event, OpsManagerEvent):
        items = [
            {
                "item_key": asmt.item_key,
                "agent_type": agent_type,
                "severity": asmt.severity.value if asmt.severity else None,
                "state": asmt.model_dump(mode="json"),
            }
            for asmt in event.assessments
        ]
    else:
        raise HTTPException(status_code=400, detail="Unknown event type")

    if items:
        await event_store.upsert_batch(branch_id, items)

    # Auto-create workflows for HIGH severity and notifications for others
    workflows_created = 0
    if isinstance(event, OpsManagerEvent):
        for asmt in event.assessments:
            severity_val = asmt.severity.value if asmt.severity else "LOW"
            if severity_val == "HIGH" and asmt.approval_required:
                await workflow_engine.create_workflow(
                    branch_id=branch_id,
                    item_key=asmt.item_key,
                    item_name=asmt.item_name,
                    severity=severity_val,
                    action_plan=asmt.action_plan or "",
                    issue=asmt.issue,
                    hours_remaining=asmt.hours_remaining,
                )
                workflows_created += 1
            else:
                from notification_store import notification_store as ns
                await ns.create(
                    branch_id=branch_id,
                    severity=severity_val,
                    message=asmt.issue,
                    source="OPERATIONS_MANAGER",
                )

    return {
        "status": "accepted",
        "branch_id": branch_id,
        "agent_type": agent_type,
        "items_processed": len(items),
        "workflows_created": workflows_created,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─── GET /events ─────────────────────────────────────────────────────────────

@app.get("/events", summary="Retrieve latest processed states")
async def get_events(
    branch_id: str | None = Query(None, description="Filter by branch ID"),
    agent_type: str | None = Query(None, description="Filter by agent type"),
    severity: str | None = Query(None, description="Filter by severity level"),
) -> dict:
    """
    Retrieve the latest processed state for each item.

    Supports filtering by:
    - branch_id
    - agent_type (LIVE_OPERATIONS_ANALYST or OPERATIONS_MANAGER)
    - severity (HIGH, MEDIUM, LOW)

    Returns only the latest state per item — no historical stacking.
    """
    # Validate enum values if provided
    if agent_type:
        try:
            AgentTypeEnum(agent_type)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid agent_type: {agent_type}. Must be one of: {[e.value for e in AgentTypeEnum]}",
            )

    if severity:
        try:
            SeverityEnum(severity)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid severity: {severity}. Must be one of: {[e.value for e in SeverityEnum]}",
            )

    events = await event_store.get_events(
        branch_id=branch_id,
        agent_type=agent_type,
        severity=severity,
    )

    return {
        "events": events,
        "count": len(events),
        "filters": {
            "branch_id": branch_id,
            "agent_type": agent_type,
            "severity": severity,
        },
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─── POST /decision ──────────────────────────────────────────────────────────

@app.post("/decision", summary="Receive human approval/rejection")
async def receive_decision(payload: DecisionPayload) -> dict:
    """
    Receive a human decision (APPROVED or REJECTED) for an action plan.

    The decision is stored and the corresponding event record is updated.
    In the future, APPROVED decisions will trigger UiPath workflows.
    """
    logger.info(
        "Decision received: %s for item %s in branch %s by %s",
        payload.decision,
        payload.item_key,
        payload.branch_id,
        payload.decided_by,
    )

    # Verify the item exists in the store
    existing = await event_store.get_item(payload.branch_id, payload.item_key)
    if not existing:
        logger.warning(
            "Decision for unknown item %s in branch %s — storing anyway",
            payload.item_key,
            payload.branch_id,
        )

    decision_record = await event_store.store_decision(
        branch_id=payload.branch_id,
        item_key=payload.item_key,
        decision=payload.decision,
        decided_by=payload.decided_by,
        decided_at=payload.decided_at,
        notes=payload.notes,
    )

    # Future: trigger UiPath workflow for APPROVED decisions
    if payload.decision == "APPROVED":
        logger.info(
            "ACTION PLAN APPROVED: %s — ready for UiPath automation",
            payload.item_key,
        )
        # Initiate the automated supplier restock workflow via UiPath
        # await trigger_uipath_workflow(payload)

    return {
        "status": "recorded",
        "branch_id": payload.branch_id,
        "item_key": payload.item_key,
        "decision": payload.decision,
        "decided_by": payload.decided_by,
        "timestamp": datetime.utcnow().isoformat(),
        "uipath_triggered": False,  # Will be True once UiPath is integrated
    }


# ─── GET /health ─────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, summary="Health check")
async def health_check() -> HealthResponse:
    """Simple health check endpoint."""
    return HealthResponse()


# ─── GET /stats ──────────────────────────────────────────────────────────────

@app.get("/stats", summary="Store statistics")
async def get_stats() -> dict:
    """Get event store statistics."""
    stats = await event_store.get_stats()
    return {
        **stats,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _count_items(event: LiveAnalystEvent | OpsManagerEvent) -> int:
    """Count items in an event for logging."""
    if isinstance(event, LiveAnalystEvent):
        return len(event.predictions)
    if isinstance(event, OpsManagerEvent):
        return len(event.assessments)
    return 0


# ─── Run ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5001, reload=True)
