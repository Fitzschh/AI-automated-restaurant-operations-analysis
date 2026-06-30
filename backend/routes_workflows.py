"""
Workflow & Decision Router

Two-tier approval endpoints, UiPath callback, workflow status,
inbox feed, notifications, and restock config.

Endpoints:
    POST /decision/manager     — First-tier manager approval
    POST /decision/admin       — Second-tier admin approval (triggers UiPath)
    POST /uipath/callback      — UiPath Maestro supplier response webhook
    GET  /workflows             — List workflows
    GET  /workflows/{id}        — Get workflow by ID
    GET  /notifications         — List notifications
    POST /notifications/{id}/archive — Archive a notification
    DELETE /notifications/{id}  — Delete a notification
    GET  /inbox                 — Activity feed
    GET  /config/restock-amount — Get restock config
    PUT  /config/restock-amount — Set restock config
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from schemas import (
    AdminDecisionPayload,
    ManagerDecisionPayload,
    RestockConfigPayload,
    UiPathCallbackPayload,
)
from workflow_engine import workflow_engine
from notification_store import notification_store
from supplier_store import supplier_store
from uipath_client import uipath_client

logger = logging.getLogger("workflows")
router = APIRouter(tags=["Workflows"])


from uipath_client import uipath_client

async def resume_hitl_workflow(workflow_id: str, branch_id: str, decision: str, notes: str):
    """
    Find and complete the corresponding UiPath HITL task for a given workflow.
    """
    logger.info("Attempting to find and complete UiPath HITL task for workflow %s", workflow_id)
    tasks = await uipath_client.get_pending_tasks()
    
    target_task_id = None
    for task in tasks:
        task_data = task.get("Data", {})
        # The BPMN maps variables to the task data. 
        # Check if WorkflowId or BranchId matches.
        if (
            task_data.get("WorkflowId") == workflow_id or 
            task_data.get("BranchId") == branch_id or
            task_data.get("workflow_id") == workflow_id or
            task_data.get("branch_id") == branch_id
        ):
            target_task_id = task.get("Id")
            break
            
    if target_task_id:
        logger.info("Found HITL task %s for workflow %s. Completing it.", target_task_id, workflow_id)
        success = await uipath_client.complete_hitl_task(
            task_id=target_task_id,
            decision=decision,
            notes=notes
        )
        if success:
            logger.info("Successfully resumed UiPath workflow for %s", workflow_id)
        else:
            logger.error("Failed to complete HITL task %s for workflow %s", target_task_id, workflow_id)
    else:
        logger.warning("No pending UiPath HITL task found matching workflow %s or branch %s. Is the BPMN running?", workflow_id, branch_id)

# ─── Manager Decision ───────────────────────────────────────────────────────

@router.post("/decision/manager", summary="Manager approval (first tier)")
async def manager_decision(payload: ManagerDecisionPayload) -> dict:
    """
    Process a branch manager's decision on a HIGH severity action plan.

    If APPROVED → workflow escalates to PENDING_ADMIN.
    If REJECTED → workflow is closed.
    """
    workflow = await workflow_engine.manager_decision(
        branch_id=payload.branch_id,
        item_key=payload.item_key,
        decision=payload.decision,
        decided_by=payload.decided_by,
        notes=payload.notes,
    )

    if not workflow:
        raise HTTPException(
            status_code=404,
            detail=f"No PENDING_MANAGER workflow found for item {payload.item_key} in branch {payload.branch_id}",
        )

    logger.info(
        "Manager %s %s item %s in branch %s → status: %s",
        payload.decided_by,
        payload.decision,
        payload.item_key,
        payload.branch_id,
        workflow["status"],
    )

    # Complete UiPath HITL task so the BPMN workflow can resume
    # We do this non-blockingly or blockingly. Let's await it.
    await resume_hitl_workflow(
        workflow_id=workflow["workflow_id"],
        branch_id=payload.branch_id,
        decision=payload.decision,
        notes=payload.notes
    )

    return {
        "workflow_id": workflow["workflow_id"],
        "status": workflow["status"],
        "next_step": "PENDING_ADMIN" if payload.decision == "APPROVED" else "CLOSED",
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─── Admin Decision ─────────────────────────────────────────────────────────

@router.post("/decision/admin", summary="Admin approval (second tier, triggers UiPath)")
async def admin_decision(payload: AdminDecisionPayload) -> dict:
    """
    Process an admin/owner's decision on an escalated action plan.

    If APPROVED → triggers UiPath Maestro supplier workflow.
    If REJECTED → workflow is closed.
    """
    workflow = await workflow_engine.admin_decision(
        workflow_id=payload.workflow_id,
        decision=payload.decision,
        decided_by=payload.decided_by,
        notes=payload.notes,
    )

    if not workflow:
        raise HTTPException(
            status_code=404,
            detail=f"No PENDING_ADMIN workflow found with ID {payload.workflow_id}",
        )

    uipath_triggered = False
    uipath_job_id = None

    if payload.decision == "APPROVED":
        # Look up supplier by product category (best-effort)
        supplier_email = ""
        supplier_name = ""
        try:
            # Use item_name as a rough category match
            suppliers = await supplier_store.get_all()
            if suppliers:
                # Pick the first supplier (in production, match by category)
                supplier_email = suppliers[0].get("email", "")
                supplier_name = suppliers[0].get("name", "")
        except Exception:
            pass

        # Trigger UiPath
        job_result = await uipath_client.start_supplier_workflow(
            workflow_id=workflow["workflow_id"],
            branch_id=workflow["branch_id"],
            item_key=workflow["item_key"],
            item_name=workflow.get("item_name", ""),
            action_plan=workflow.get("action_plan", ""),
            restock_amount=workflow.get("restock_amount", 10),
            supplier_email=supplier_email,
            supplier_name=supplier_name,
        )

        job_id = job_result.get("job_id", "")
        if job_id:
            await workflow_engine.set_uipath_job(workflow["workflow_id"], job_id)
            uipath_triggered = True
            uipath_job_id = job_id

    logger.info(
        "Admin %s %s workflow %s → status: %s, uipath_triggered: %s",
        payload.decided_by,
        payload.decision,
        payload.workflow_id,
        workflow["status"],
        uipath_triggered,
    )

    # Complete UiPath HITL task so the BPMN workflow can resume
    await resume_hitl_workflow(
        workflow_id=workflow["workflow_id"],
        branch_id=workflow.get("branch_id", ""),
        decision=payload.decision,
        notes=payload.notes
    )

    return {
        "workflow_id": workflow["workflow_id"],
        "status": workflow["status"],
        "uipath_triggered": uipath_triggered,
        "uipath_job_id": uipath_job_id,
        "simulated": not uipath_client.is_configured,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─── UiPath Callback ────────────────────────────────────────────────────────

@router.post("/uipath/callback", summary="UiPath Maestro supplier response webhook")
async def uipath_callback(payload: UiPathCallbackPayload) -> dict:
    """
    Receive supplier response from UiPath Maestro.

    If supplier APPROVED → auto-restock inventory.
    If supplier REJECTED/TIMEOUT → close workflow.
    """
    workflow = await workflow_engine.process_supplier_response(
        workflow_id=payload.workflow_id,
        supplier_status=payload.supplier_status,
        supplier_notes=payload.supplier_notes,
        responded_at=payload.responded_at,
    )

    if not workflow:
        raise HTTPException(
            status_code=404,
            detail=f"No PENDING_SUPPLIER workflow found with ID {payload.workflow_id}",
        )

    inventory_updated = False

    if payload.supplier_status == "APPROVED":
        # Auto-restock: update inventory via Firebase
        # This will be handled by the frontend or a direct Firebase call
        # For now, we record the intent and the frontend picks it up
        inventory_updated = True
        logger.info(
            "Supplier approved restock for workflow %s — +%d units for %s",
            payload.workflow_id,
            workflow.get("restock_amount", 10),
            workflow.get("item_key"),
        )

    logger.info(
        "UiPath callback: workflow=%s supplier_status=%s job=%s",
        payload.workflow_id,
        payload.supplier_status,
        payload.job_id,
    )

    return {
        "status": workflow["status"],
        "workflow_id": payload.workflow_id,
        "supplier_status": payload.supplier_status,
        "inventory_updated": inventory_updated,
        "restock_amount": workflow.get("restock_amount", 10) if inventory_updated else 0,
        "item_key": workflow.get("item_key"),
        "branch_id": workflow.get("branch_id"),
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─── Workflows ───────────────────────────────────────────────────────────────

@router.get("/workflows", summary="List workflows")
async def list_workflows(
    branch_id: str | None = Query(None),
    status: str | None = Query(None),
) -> dict:
    """List all workflows with optional filters."""
    workflows = await workflow_engine.get_workflows(
        branch_id=branch_id,
        status=status,
    )
    return {
        "workflows": workflows,
        "count": len(workflows),
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/workflows/{workflow_id}", summary="Get workflow by ID")
async def get_workflow(workflow_id: str) -> dict:
    """Get a specific workflow by ID."""
    workflow = await workflow_engine.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    return {"workflow": workflow}


# ─── Notifications ───────────────────────────────────────────────────────────

@router.get("/notifications", summary="List notifications")
async def list_notifications(
    branch_id: str | None = Query(None),
    severity: str | None = Query(None),
    archived: bool | None = Query(None),
    approval_status: str | None = Query(
        None, description="Filter by workflow status (e.g. PENDING_ADMIN, COMPLETED)"
    ),
) -> dict:
    """List notifications with optional filters."""
    notifications = await notification_store.get_all(
        branch_id=branch_id,
        severity=severity,
        archived=archived,
        approval_status=approval_status,
    )
    return {
        "notifications": notifications,
        "count": len(notifications),
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.post("/notifications/{notification_id}/archive", summary="Archive a notification")
async def archive_notification(notification_id: str) -> dict:
    """Archive a notification (soft delete)."""
    record = await notification_store.archive(notification_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Notification {notification_id} not found")
    return {
        "archived": True,
        "notification_id": notification_id,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.delete("/notifications/{notification_id}", summary="Delete a notification")
async def delete_notification(notification_id: str) -> dict:
    """Delete a notification permanently."""
    deleted = await notification_store.delete(notification_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Notification {notification_id} not found")
    return {
        "deleted": True,
        "notification_id": notification_id,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─── Inbox ───────────────────────────────────────────────────────────────────

@router.get("/inbox", summary="Activity feed inbox")
async def get_inbox(
    branch_id: str | None = Query(None),
    role: str | None = Query(None, description="manager or admin"),
) -> dict:
    """
    Get inbox activity feed.

    - role=manager + branch_id → items for that branch only
    - role=admin → all branches
    """
    items = await workflow_engine.get_inbox(
        branch_id=branch_id,
        role=role,
    )
    return {
        "items": items,
        "count": len(items),
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─── Restock Config ─────────────────────────────────────────────────────────

@router.get("/config/restock-amount", summary="Get default restock amount")
async def get_restock_config() -> dict:
    """Get the current configurable restock amount."""
    amount = await workflow_engine.get_restock_amount()
    return {"amount": amount}


@router.put("/config/restock-amount", summary="Set default restock amount")
async def set_restock_config(payload: RestockConfigPayload) -> dict:
    """Set the configurable restock amount (1–1000)."""
    amount = await workflow_engine.set_restock_amount(payload.amount)
    logger.info("Restock amount updated to %d", amount)
    return {
        "amount": amount,
        "timestamp": datetime.utcnow().isoformat(),
    }
