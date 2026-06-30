"""
Adapter State Store

In-memory context store for the BPMN Event Gateway Adapter.
Holds accumulated data from multi-step BPMN task chains and
workflow context needed to enrich minimal BPMN payloads before
forwarding to the real backend.

Keyed by branch_id (cycle-scoped) with workflow_id sub-indexing
once a workflow is created.

Thread-safe via asyncio.Lock.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger("adapter_state")


class AdapterState:
    """
    Cycle-scoped state store for the BPMN adapter.

    Holds:
    - Analyst predictions accumulated across SUBSCRIBE/VELOCITY/FORECAST/BUILD steps
    - Manager assessments accumulated across CLASSIFY/PLANS/REVENUE/BUILD steps
    - Active workflow context (workflow_id, branch_id, item_key, etc.)
    - HITL results (manager/admin decision, notes, decided_by)
    - Supplier info from LOOKUP_SUPPLIER
    - UiPath job context (job_id)
    - Composed email body from COMPOSE_EMAIL
    """

    def __init__(self) -> None:
        # Per-branch cycle state
        self._cycles: dict[str, dict[str, Any]] = {}
        # Per-workflow state (keyed by workflow_id)
        self._workflows: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    # ─── Cycle State (branch-scoped) ─────────────────────────────────

    async def get_cycle(self, branch_id: str) -> dict[str, Any]:
        """Get or create cycle state for a branch."""
        async with self._lock:
            if branch_id not in self._cycles:
                self._cycles[branch_id] = self._new_cycle(branch_id)
            return self._cycles[branch_id]

    async def update_cycle(self, branch_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        """Merge updates into the cycle state for a branch."""
        async with self._lock:
            if branch_id not in self._cycles:
                self._cycles[branch_id] = self._new_cycle(branch_id)
            self._cycles[branch_id].update(updates)
            self._cycles[branch_id]["updated_at"] = datetime.utcnow().isoformat()
            return self._cycles[branch_id]

    async def reset_cycle(self, branch_id: str) -> None:
        """Reset cycle state for a new timer cycle."""
        async with self._lock:
            self._cycles[branch_id] = self._new_cycle(branch_id)

    # ─── Workflow State (workflow_id-scoped) ──────────────────────────

    async def set_workflow(self, workflow_id: str, data: dict[str, Any]) -> None:
        """Store workflow-level context."""
        async with self._lock:
            self._workflows[workflow_id] = {
                **data,
                "workflow_id": workflow_id,
                "updated_at": datetime.utcnow().isoformat(),
            }

    async def get_workflow(self, workflow_id: str) -> dict[str, Any] | None:
        """Get workflow-level context."""
        async with self._lock:
            return self._workflows.get(workflow_id)

    async def update_workflow(self, workflow_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        """Merge updates into workflow state."""
        async with self._lock:
            if workflow_id not in self._workflows:
                return None
            self._workflows[workflow_id].update(updates)
            self._workflows[workflow_id]["updated_at"] = datetime.utcnow().isoformat()
            return self._workflows[workflow_id]

    # ─── Lookup helpers ──────────────────────────────────────────────

    async def find_workflow_by_branch(
        self, branch_id: str, status: str | None = None
    ) -> dict[str, Any] | None:
        """Find the most recent workflow for a branch (optionally filtered by status)."""
        async with self._lock:
            candidates = [
                w for w in self._workflows.values()
                if w.get("branch_id") == branch_id
                and (status is None or w.get("status") == status)
            ]
            if not candidates:
                return None
            # Return most recently updated
            candidates.sort(key=lambda w: w.get("updated_at", ""), reverse=True)
            return candidates[0]

    async def find_workflow_by_item(
        self, branch_id: str, item_key: str, status: str | None = None
    ) -> dict[str, Any] | None:
        """Find workflow by branch + item key."""
        async with self._lock:
            for w in self._workflows.values():
                if (
                    w.get("branch_id") == branch_id
                    and w.get("item_key") == item_key
                    and (status is None or w.get("status") == status)
                ):
                    return w
            return None

    # ─── Stats ───────────────────────────────────────────────────────

    async def get_stats(self) -> dict[str, Any]:
        """Get state store statistics."""
        async with self._lock:
            return {
                "active_cycles": len(self._cycles),
                "tracked_workflows": len(self._workflows),
                "branches": list(self._cycles.keys()),
            }

    # ─── Internals ───────────────────────────────────────────────────

    @staticmethod
    def _new_cycle(branch_id: str) -> dict[str, Any]:
        """Create a fresh cycle state."""
        now = datetime.utcnow().isoformat()
        return {
            "branch_id": branch_id,
            "created_at": now,
            "updated_at": now,
            # Analyst accumulation
            "firebase_subscribed": False,
            "velocity_data": None,
            "depletion_forecast": None,
            "predictions": [],
            # Manager accumulation
            "severity_classifications": [],
            "action_plans": [],
            "revenue_metrics": None,
            "assessments": [],
            # Dispatch
            "event_response": None,
            # Workflow context (set after workflow creation)
            "workflow_id": None,
            "item_key": None,
            "item_name": None,
            "severity": None,
            "action_plan": None,
            "hours_remaining": None,
            # HITL results
            "manager_decision": None,
            "manager_notes": None,
            "manager_email": None,
            "admin_decision": None,
            "admin_notes": None,
            "admin_email": None,
            # Supplier
            "supplier_email": None,
            "supplier_name": None,
            "supplier_decision": None,
            "supplier_notes": None,
            # UiPath
            "uipath_job_id": None,
            "callback_url": None,
            "composed_email": None,
            # Restock
            "restock_amount": None,
        }


# Singleton instance
adapter_state = AdapterState()
