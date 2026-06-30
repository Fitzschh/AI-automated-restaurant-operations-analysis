"""
In-Memory Supplier Store

CRUD storage for supplier records.
Thread-safe via asyncio.Lock.
Designed for future replacement with Firebase RTDB or PostgreSQL.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from typing import Any


class SupplierStore:
    """
    In-memory supplier store keyed by supplier_id.

    Structure:
        _store[supplier_id] = {
            "supplier_id": str,
            "name": str,
            "email": str,
            "product_category": str,
            "notes": str,
            "created_at": datetime,
            "updated_at": datetime,
        }
    """

    def __init__(self) -> None:
        self._store: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    async def create(
        self,
        name: str,
        email: str,
        product_category: str,
        notes: str = "",
    ) -> dict[str, Any]:
        """Create a new supplier record."""
        async with self._lock:
            supplier_id = f"sup_{uuid.uuid4().hex[:12]}"
            now = datetime.utcnow()
            record = {
                "supplier_id": supplier_id,
                "name": name,
                "email": email,
                "product_category": product_category,
                "notes": notes,
                "created_at": now,
                "updated_at": now,
            }
            self._store[supplier_id] = record
            return record

    async def get_all(
        self,
        category: str | None = None,
    ) -> list[dict[str, Any]]:
        """List all suppliers, optionally filtered by product category."""
        async with self._lock:
            results = list(self._store.values())
            if category:
                cat_lower = category.lower()
                results = [
                    s for s in results
                    if cat_lower in s.get("product_category", "").lower()
                ]
            results.sort(
                key=lambda s: s.get("created_at", datetime.min),
                reverse=True,
            )
            return results

    async def get_by_id(self, supplier_id: str) -> dict[str, Any] | None:
        """Get a single supplier by ID."""
        async with self._lock:
            return self._store.get(supplier_id)

    async def update(
        self,
        supplier_id: str,
        **fields: Any,
    ) -> dict[str, Any] | None:
        """Update an existing supplier record. Returns None if not found."""
        async with self._lock:
            record = self._store.get(supplier_id)
            if not record:
                return None

            allowed = {"name", "email", "product_category", "notes"}
            for key, value in fields.items():
                if key in allowed and value is not None:
                    record[key] = value
            record["updated_at"] = datetime.utcnow()
            return record

    async def delete(self, supplier_id: str) -> bool:
        """Delete a supplier. Returns True if deleted, False if not found."""
        async with self._lock:
            if supplier_id in self._store:
                del self._store[supplier_id]
                return True
            return False

    async def get_stats(self) -> dict[str, Any]:
        """Get supplier store statistics."""
        async with self._lock:
            categories = set(
                s.get("product_category", "") for s in self._store.values()
            )
            return {
                "total_suppliers": len(self._store),
                "categories": sorted(categories),
            }


# Singleton instance
supplier_store = SupplierStore()
