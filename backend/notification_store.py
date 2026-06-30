"""
In-Memory Notification Store

Persistent notification storage with archive and deletion support.
Thread-safe via asyncio.Lock.
Designed for future replacement with Firebase RTDB or PostgreSQL.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from typing import Any


class NotificationStore:
    """
    In-memory notification store keyed by notification_id,
    organized by branch_id for efficient filtering.

    Structure:
        _store[branch_id][notification_id] = {
            "notification_id": str,
            "branch_id": str,
            "event_id": str | None,
            "workflow_id": str | None,
            "timestamp": datetime,
            "severity": str,
            "message": str,
            "source": str,
            "approval_status": str | None,
            "supplier_status": str | None,
            "action_taken": str | None,
            "action_plan": str | None,
            "decided_by": str | None,
            "archived": bool,
        }
    """

    def __init__(self) -> None:
        self._store: dict[str, dict[str, dict[str, Any]]] = {}
        self._lock = asyncio.Lock()

    async def create(
        self,
        branch_id: str,
        severity: str,
        message: str,
        source: str = "SYSTEM",
        event_id: str | None = None,
        workflow_id: str | None = None,
        approval_status: str | None = None,
        supplier_status: str | None = None,
        action_taken: str | None = None,
        action_plan: str | None = None,
        decided_by: str | None = None,
    ) -> dict[str, Any]:
        """Create a new notification."""
        async with self._lock:
            notification_id = f"ntf_{uuid.uuid4().hex[:12]}"
            now = datetime.utcnow()

            if branch_id not in self._store:
                self._store[branch_id] = {}

            record = {
                "notification_id": notification_id,
                "branch_id": branch_id,
                "event_id": event_id,
                "workflow_id": workflow_id,
                "timestamp": now,
                "severity": severity,
                "message": message,
                "source": source,
                "approval_status": approval_status,
                "supplier_status": supplier_status,
                "action_taken": action_taken,
                "action_plan": action_plan,
                "decided_by": decided_by,
                "archived": False,
            }
            self._store[branch_id][notification_id] = record
            return record

    async def get_all(
        self,
        branch_id: str | None = None,
        severity: str | None = None,
        archived: bool | None = None,
        approval_status: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Get notifications with optional filters.

        Filters:
            - branch_id: only notifications for this branch
            - severity: only this severity level
            - archived: True (only archived), False (only active), None (all)
            - approval_status: exact workflow status (e.g. PENDING_MANAGER)
        """
        async with self._lock:
            results = []

            branches = (
                {branch_id: self._store.get(branch_id, {})}
                if branch_id
                else self._store
            )

            for _bid, notifications in branches.items():
                for record in notifications.values():
                    if severity and record.get("severity") != severity:
                        continue
                    if archived is not None and record.get("archived") != archived:
                        continue
                    if approval_status and record.get("approval_status") != approval_status:
                        continue
                    results.append(record)

            results.sort(
                key=lambda r: r.get("timestamp", datetime.min),
                reverse=True,
            )
            return results

    async def archive(self, notification_id: str) -> dict[str, Any] | None:
        """Archive a notification. Returns updated record or None."""
        async with self._lock:
            for branch_notifications in self._store.values():
                if notification_id in branch_notifications:
                    record = branch_notifications[notification_id]
                    record["archived"] = True
                    return record
            return None

    async def delete(self, notification_id: str) -> bool:
        """Delete a notification permanently. Returns True if deleted."""
        async with self._lock:
            for branch_notifications in self._store.values():
                if notification_id in branch_notifications:
                    del branch_notifications[notification_id]
                    return True
            return False

    async def get_stats(self) -> dict[str, Any]:
        """Get notification store statistics."""
        async with self._lock:
            total = sum(
                len(notifications) for notifications in self._store.values()
            )
            archived = sum(
                1
                for notifications in self._store.values()
                for n in notifications.values()
                if n.get("archived")
            )
            return {
                "total_notifications": total,
                "active": total - archived,
                "archived": archived,
                "branches": len(self._store),
            }


# Singleton instance
notification_store = NotificationStore()
