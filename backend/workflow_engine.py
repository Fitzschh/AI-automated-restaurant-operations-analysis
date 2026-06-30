"""
Workflow Engine

State machine for the two-tier approval pipeline:
    PENDING_MANAGER → MANAGER_APPROVED → PENDING_ADMIN → ADMIN_APPROVED
    → PENDING_UIPATH → PENDING_SUPPLIER → SUPPLIER_APPROVED → COMPLETED

Each rejected state is a terminal state.
Thread-safe via asyncio.Lock.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Any

from notification_store import notification_store

logger = logging.getLogger("workflow_engine")


class WorkflowEngine:
    """
    In-memory workflow engine keyed by workflow_id.

    Manages the full lifecycle of a HIGH severity action plan
    through the two-tier approval pipeline.
    """

    def __init__(self) -> None:
        self._store: dict[str, dict[str, Any]] = {}
        self._inbox: list[dict[str, Any]] = []
        self._restock_amount: int = 10
        self._lock = asyncio.Lock()

    # ─── Restock Config ──────────────────────────────────────────────

    async def get_restock_amount(self) -> int:
        async with self._lock:
            return self._restock_amount

    async def set_restock_amount(self, amount: int) -> int:
        async with self._lock:
            self._restock_amount = max(1, min(1000, amount))
            return self._restock_amount

    # ─── Workflow CRUD ───────────────────────────────────────────────

    async def create_workflow(
        self,
        branch_id: str,
        item_key: str,
        item_name: str = "",
        severity: str = "HIGH",
        action_plan: str = "",
        issue: str = "",
        hours_remaining: float | None = None,
        event_id: str = "",
    ) -> dict[str, Any]:
        """Create a new workflow in PENDING_MANAGER state."""
        async with self._lock:
            workflow_id = f"wf_{uuid.uuid4().hex[:12]}"
            now = datetime.utcnow()

            record = {
                "workflow_id": workflow_id,
                "event_id": event_id,
                "branch_id": branch_id,
                "item_key": item_key,
                "item_name": item_name,
                "severity": severity,
                "issue": issue,
                "hours_remaining": hours_remaining,
                "action_plan": action_plan,
                "status": "PENDING_MANAGER",
                "manager_decision": None,
                "admin_decision": None,
                "supplier_response": None,
                "uipath_job_id": None,
                "restock_amount": self._restock_amount,
                "created_at": now,
                "updated_at": now,
            }
            self._store[workflow_id] = record

        # Create notification + inbox entry (outside lock to avoid nesting)
        await notification_store.create(
            branch_id=branch_id,
            severity=severity,
            message=issue or f"Action plan created: {action_plan}",
            source="OPERATIONS_MANAGER",
            workflow_id=workflow_id,
            approval_status="PENDING_MANAGER",
            action_plan=action_plan or None,
        )
        await self._add_inbox_item(
            branch_id=branch_id,
            workflow_id=workflow_id,
            category="APPROVAL_REQUESTED",
            title=f"Approval Required: {item_name or item_key}",
            message=action_plan or issue or "",
            severity=severity,
        )

        return record

    async def get_workflow(self, workflow_id: str) -> dict[str, Any] | None:
        """Get a workflow by ID."""
        async with self._lock:
            return self._store.get(workflow_id)

    async def get_workflows(
        self,
        branch_id: str | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        """List workflows with optional filters."""
        async with self._lock:
            results = list(self._store.values())

            if branch_id:
                results = [w for w in results if w["branch_id"] == branch_id]
            if status:
                results = [w for w in results if w["status"] == status]

            results.sort(
                key=lambda w: w.get("updated_at", datetime.min),
                reverse=True,
            )
            return results

    # ─── Manager Decision ────────────────────────────────────────────

    async def manager_decision(
        self,
        branch_id: str,
        item_key: str,
        decision: str,
        decided_by: str,
        notes: str | None = None,
    ) -> dict[str, Any] | None:
        """
        Process a manager's decision.

        APPROVED → status becomes PENDING_ADMIN
        REJECTED → status becomes MANAGER_REJECTED (terminal)

        Returns the updated workflow or None if no matching workflow found.
        """
        now = datetime.utcnow()
        workflow = None

        async with self._lock:
            # Find the workflow for this branch+item in PENDING_MANAGER state
            for wf in self._store.values():
                if (
                    wf["branch_id"] == branch_id
                    and wf["item_key"] == item_key
                    and wf["status"] == "PENDING_MANAGER"
                ):
                    workflow = wf
                    break

            if not workflow:
                return None

            workflow["manager_decision"] = {
                "decision": decision,
                "decided_by": decided_by,
                "decided_at": now,
                "notes": notes,
            }
            workflow["updated_at"] = now

            if decision == "APPROVED":
                workflow["status"] = "PENDING_ADMIN"
            else:
                workflow["status"] = "MANAGER_REJECTED"

        # Notifications and inbox (outside lock)
        wf_id = workflow["workflow_id"]
        item_name = workflow.get("item_name") or item_key
        action_plan = workflow.get("action_plan", "")

        if decision == "APPROVED":
            await notification_store.create(
                branch_id=branch_id,
                severity=workflow["severity"],
                message=f"Manager approved: {item_name}. Awaiting admin review.",
                source="OPERATIONS_MANAGER",
                workflow_id=wf_id,
                approval_status="PENDING_ADMIN",
                action_plan=action_plan or None,
                decided_by=decided_by,
            )
            await self._add_inbox_item(
                branch_id=branch_id,
                workflow_id=wf_id,
                category="APPROVAL_ACCEPTED",
                title=f"Manager Approved: {item_name}",
                message=f"Awaiting admin review. Action plan: {action_plan}",
                severity=workflow["severity"],
                actor=decided_by,
            )
        else:
            await notification_store.create(
                branch_id=branch_id,
                severity=workflow["severity"],
                message=f"Manager rejected action plan for {item_name}.",
                source="OPERATIONS_MANAGER",
                workflow_id=wf_id,
                approval_status="MANAGER_REJECTED",
                action_plan=action_plan or None,
                decided_by=decided_by,
            )
            await self._add_inbox_item(
                branch_id=branch_id,
                workflow_id=wf_id,
                category="APPROVAL_REJECTED",
                title=f"Manager Rejected: {item_name}",
                message=notes or "No reason provided.",
                severity=workflow["severity"],
                actor=decided_by,
            )

        return workflow

    # ─── Admin Decision ──────────────────────────────────────────────

    async def admin_decision(
        self,
        workflow_id: str,
        decision: str,
        decided_by: str,
        notes: str | None = None,
    ) -> dict[str, Any] | None:
        """
        Process an admin's decision.

        APPROVED → status becomes PENDING_UIPATH (ready for UiPath trigger)
        REJECTED → status becomes ADMIN_REJECTED (terminal)

        Returns the updated workflow or None if not found.
        """
        now = datetime.utcnow()

        async with self._lock:
            workflow = self._store.get(workflow_id)
            if not workflow or workflow["status"] != "PENDING_ADMIN":
                return None

            workflow["admin_decision"] = {
                "decision": decision,
                "decided_by": decided_by,
                "decided_at": now,
                "notes": notes,
            }
            workflow["updated_at"] = now

            if decision == "APPROVED":
                workflow["status"] = "PENDING_UIPATH"
            else:
                workflow["status"] = "ADMIN_REJECTED"

        branch_id = workflow["branch_id"]
        item_name = workflow.get("item_name") or workflow["item_key"]
        action_plan = workflow.get("action_plan", "")

        if decision == "APPROVED":
            await notification_store.create(
                branch_id=branch_id,
                severity=workflow["severity"],
                message=f"Admin approved: {item_name}. Triggering UiPath automation.",
                source="SYSTEM",
                workflow_id=workflow_id,
                approval_status="PENDING_UIPATH",
                action_plan=action_plan or None,
                decided_by=decided_by,
            )
            await self._add_inbox_item(
                branch_id=branch_id,
                workflow_id=workflow_id,
                category="APPROVAL_ACCEPTED",
                title=f"Admin Approved: {item_name}",
                message=f"UiPath automation triggered. Action plan: {action_plan}",
                severity=workflow["severity"],
                actor=decided_by,
            )
        else:
            await notification_store.create(
                branch_id=branch_id,
                severity=workflow["severity"],
                message=f"Admin rejected action plan for {item_name}.",
                source="SYSTEM",
                workflow_id=workflow_id,
                approval_status="ADMIN_REJECTED",
                action_plan=action_plan or None,
                decided_by=decided_by,
            )
            await self._add_inbox_item(
                branch_id=branch_id,
                workflow_id=workflow_id,
                category="APPROVAL_REJECTED",
                title=f"Admin Rejected: {item_name}",
                message=notes or "No reason provided.",
                severity=workflow["severity"],
                actor=decided_by,
            )

        return workflow

    # ─── UiPath Integration ──────────────────────────────────────────

    async def set_uipath_job(
        self,
        workflow_id: str,
        job_id: str,
    ) -> dict[str, Any] | None:
        """Record the UiPath job ID and move to PENDING_SUPPLIER."""
        async with self._lock:
            workflow = self._store.get(workflow_id)
            if not workflow or workflow["status"] != "PENDING_UIPATH":
                return None

            workflow["uipath_job_id"] = job_id
            workflow["status"] = "PENDING_SUPPLIER"
            workflow["updated_at"] = datetime.utcnow()
            return workflow

    async def process_supplier_response(
        self,
        workflow_id: str,
        supplier_status: str,
        supplier_notes: str | None = None,
        responded_at: datetime | None = None,
    ) -> dict[str, Any] | None:
        """
        Process a supplier's response from UiPath callback.

        APPROVED → status becomes COMPLETED (triggers auto-restock)
        REJECTED/TIMEOUT → terminal state
        """
        now = responded_at or datetime.utcnow()

        async with self._lock:
            workflow = self._store.get(workflow_id)
            if not workflow or workflow["status"] != "PENDING_SUPPLIER":
                return None

            workflow["supplier_response"] = {
                "status": supplier_status,
                "responded_at": now,
                "notes": supplier_notes,
            }
            workflow["updated_at"] = datetime.utcnow()

            if supplier_status == "APPROVED":
                workflow["status"] = "COMPLETED"
            else:
                workflow["status"] = "SUPPLIER_REJECTED"

        branch_id = workflow["branch_id"]
        item_name = workflow.get("item_name") or workflow["item_key"]
        restock = workflow.get("restock_amount", self._restock_amount)

        if supplier_status == "APPROVED":
            await notification_store.create(
                branch_id=branch_id,
                severity=workflow["severity"],
                message=f"Supplier approved restock of {item_name} (+{restock} units).",
                source="UIPATH",
                workflow_id=workflow_id,
                approval_status="COMPLETED",
                supplier_status="APPROVED",
                action_taken=f"Inventory increased by {restock} units",
            )
            await self._add_inbox_item(
                branch_id=branch_id,
                workflow_id=workflow_id,
                category="SUPPLIER_CONFIRMATION",
                title=f"Supplier Confirmed: {item_name}",
                message=f"Restock of +{restock} units approved. {supplier_notes or ''}".strip(),
                severity=workflow["severity"],
            )
        else:
            await notification_store.create(
                branch_id=branch_id,
                severity=workflow["severity"],
                message=f"Supplier {supplier_status.lower()} restock for {item_name}.",
                source="UIPATH",
                workflow_id=workflow_id,
                supplier_status=supplier_status,
            )
            await self._add_inbox_item(
                branch_id=branch_id,
                workflow_id=workflow_id,
                category="SUPPLIER_CONFIRMATION",
                title=f"Supplier {supplier_status.title()}: {item_name}",
                message=supplier_notes or "No notes provided.",
                severity=workflow["severity"],
            )

        return workflow

    # ─── Inbox ───────────────────────────────────────────────────────

    async def _add_inbox_item(
        self,
        branch_id: str,
        category: str,
        title: str,
        message: str,
        workflow_id: str | None = None,
        severity: str | None = None,
        actor: str = "",
    ) -> dict[str, Any]:
        """Add an item to the inbox feed."""
        item = {
            "inbox_id": f"ibx_{uuid.uuid4().hex[:12]}",
            "branch_id": branch_id,
            "workflow_id": workflow_id,
            "timestamp": datetime.utcnow(),
            "category": category,
            "title": title,
            "message": message,
            "severity": severity,
            "actor": actor,
            "read": False,
        }
        async with self._lock:
            self._inbox.append(item)
            # Keep last 500 items
            if len(self._inbox) > 500:
                self._inbox = self._inbox[-500:]
        return item

    async def get_inbox(
        self,
        branch_id: str | None = None,
        role: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Get inbox items.

        - role=manager → filter to the specific branch
        - role=admin → all branches
        """
        async with self._lock:
            results = list(self._inbox)

        if branch_id and role != "admin":
            results = [i for i in results if i["branch_id"] == branch_id]

        results.sort(
            key=lambda i: i.get("timestamp", datetime.min),
            reverse=True,
        )
        return results[:100]  # Cap at 100

    # ─── Stats ───────────────────────────────────────────────────────

    async def get_stats(self) -> dict[str, Any]:
        """Get workflow engine statistics."""
        async with self._lock:
            statuses: dict[str, int] = {}
            for wf in self._store.values():
                s = wf.get("status", "UNKNOWN")
                statuses[s] = statuses.get(s, 0) + 1
            return {
                "total_workflows": len(self._store),
                "inbox_items": len(self._inbox),
                "by_status": statuses,
            }


# Singleton instance
workflow_engine = WorkflowEngine()
