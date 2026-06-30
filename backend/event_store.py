"""
In-Memory Event Store with Per-Item Deduplication

Stores the latest state per (branch_id, item_key) pair.
Old states are overwritten, never stacked.

Thread-safe via asyncio.Lock.
Designed for future replacement with Redis or PostgreSQL.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any


class EventStore:
    """
    In-memory event store keyed by (branch_id, item_key).

    Structure:
        _store[branch_id][item_key] = {
            "agent_type": str,
            "severity": str | None,
            "latest_state": dict,
            "updated_at": datetime,
        }

    Decisions are stored separately:
        _decisions[branch_id][item_key] = {
            "decision": str,
            "decided_by": str,
            "decided_at": datetime,
            "notes": str | None,
        }
    """

    def __init__(self) -> None:
        self._store: dict[str, dict[str, dict[str, Any]]] = {}
        self._decisions: dict[str, dict[str, dict[str, Any]]] = {}
        self._lock = asyncio.Lock()

    async def upsert_event(
        self,
        branch_id: str,
        item_key: str,
        agent_type: str,
        severity: str | None,
        state: dict,
    ) -> dict[str, Any]:
        """
        Insert or update the latest state for an item.
        Previous state for the same (branch_id, item_key) is overwritten.

        Returns the stored record.
        """
        async with self._lock:
            if branch_id not in self._store:
                self._store[branch_id] = {}

            record = {
                "branch_id": branch_id,
                "item_key": item_key,
                "agent_type": agent_type,
                "severity": severity,
                "latest_state": state,
                "updated_at": datetime.utcnow(),
            }

            self._store[branch_id][item_key] = record
            return record

    async def upsert_batch(
        self,
        branch_id: str,
        items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Batch upsert multiple items for a branch.

        Each item dict must contain:
            - item_key: str
            - agent_type: str
            - severity: str | None
            - state: dict

        Returns list of stored records.
        """
        results = []
        async with self._lock:
            if branch_id not in self._store:
                self._store[branch_id] = {}

            now = datetime.utcnow()
            for item in items:
                record = {
                    "branch_id": branch_id,
                    "item_key": item["item_key"],
                    "agent_type": item["agent_type"],
                    "severity": item.get("severity"),
                    "latest_state": item.get("state", {}),
                    "updated_at": now,
                }
                self._store[branch_id][item["item_key"]] = record
                results.append(record)

        return results

    async def get_events(
        self,
        branch_id: str | None = None,
        agent_type: str | None = None,
        severity: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Retrieve latest states, optionally filtered.

        Filters:
            - branch_id: only events for this branch
            - agent_type: only events from this agent
            - severity: only events with this severity level
        """
        async with self._lock:
            results = []

            branches = (
                {branch_id: self._store.get(branch_id, {})}
                if branch_id
                else self._store
            )

            for bid, items in branches.items():
                for item_key, record in items.items():
                    if agent_type and record.get("agent_type") != agent_type:
                        continue
                    if severity and record.get("severity") != severity:
                        continue
                    results.append(record)

            # Sort by updated_at descending
            results.sort(key=lambda r: r.get("updated_at", datetime.min), reverse=True)
            return results

    async def get_item(
        self,
        branch_id: str,
        item_key: str,
    ) -> dict[str, Any] | None:
        """Get the latest state for a specific item."""
        async with self._lock:
            return self._store.get(branch_id, {}).get(item_key)

    async def store_decision(
        self,
        branch_id: str,
        item_key: str,
        decision: str,
        decided_by: str,
        decided_at: datetime,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """
        Store a human decision for an item.
        Also updates the corresponding event record if it exists.
        """
        async with self._lock:
            if branch_id not in self._decisions:
                self._decisions[branch_id] = {}

            decision_record = {
                "branch_id": branch_id,
                "item_key": item_key,
                "decision": decision,
                "decided_by": decided_by,
                "decided_at": decided_at,
                "notes": notes,
                "stored_at": datetime.utcnow(),
            }
            self._decisions[branch_id][item_key] = decision_record

            # Update the event record if it exists
            if branch_id in self._store and item_key in self._store[branch_id]:
                event_record = self._store[branch_id][item_key]
                state = event_record.get("latest_state", {})
                state["decision"] = decision
                state["decided_by"] = decided_by
                state["decided_at"] = decided_at.isoformat()
                event_record["latest_state"] = state
                event_record["updated_at"] = datetime.utcnow()

            return decision_record

    async def get_decisions(
        self,
        branch_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Get all stored decisions, optionally filtered by branch."""
        async with self._lock:
            results = []

            branches = (
                {branch_id: self._decisions.get(branch_id, {})}
                if branch_id
                else self._decisions
            )

            for _bid, items in branches.items():
                results.extend(items.values())

            results.sort(
                key=lambda r: r.get("decided_at", datetime.min),
                reverse=True,
            )
            return results

    async def clear_branch(self, branch_id: str) -> int:
        """Remove all events and decisions for a branch. Returns count removed."""
        async with self._lock:
            count = len(self._store.get(branch_id, {}))
            self._store.pop(branch_id, None)
            self._decisions.pop(branch_id, None)
            return count

    async def get_stats(self) -> dict[str, Any]:
        """Get store statistics."""
        async with self._lock:
            total_events = sum(
                len(items) for items in self._store.values()
            )
            total_decisions = sum(
                len(items) for items in self._decisions.values()
            )
            return {
                "branches": len(self._store),
                "total_events": total_events,
                "total_decisions": total_decisions,
            }


# Singleton instance
event_store = EventStore()
