"""
Supplier Management Router

CRUD endpoints for managing supplier records.

Endpoints:
    GET    /suppliers          — List all suppliers (filterable by category)
    POST   /suppliers          — Create a new supplier
    GET    /suppliers/{id}     — Get a single supplier
    PUT    /suppliers/{id}     — Update a supplier
    DELETE /suppliers/{id}     — Delete a supplier
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException

from schemas import SupplierPayload, SupplierRecord
from supplier_store import supplier_store

logger = logging.getLogger("suppliers")
router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


@router.get("", summary="List all suppliers")
async def list_suppliers(category: str | None = None) -> dict:
    """List all suppliers, optionally filtered by product category."""
    suppliers = await supplier_store.get_all(category=category)
    return {
        "suppliers": suppliers,
        "count": len(suppliers),
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.post("", summary="Create a new supplier", status_code=201)
async def create_supplier(payload: SupplierPayload) -> dict:
    """Create a new supplier record."""
    record = await supplier_store.create(
        name=payload.name,
        email=payload.email,
        product_category=payload.product_category,
        notes=payload.notes,
    )
    logger.info("Supplier created: %s (%s)", record["name"], record["supplier_id"])
    return {
        "supplier": record,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/{supplier_id}", summary="Get a supplier by ID")
async def get_supplier(supplier_id: str) -> dict:
    """Get a single supplier by ID."""
    record = await supplier_store.get_by_id(supplier_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Supplier {supplier_id} not found")
    return {"supplier": record}


@router.put("/{supplier_id}", summary="Update a supplier")
async def update_supplier(supplier_id: str, payload: SupplierPayload) -> dict:
    """Update an existing supplier record."""
    record = await supplier_store.update(
        supplier_id,
        name=payload.name,
        email=payload.email,
        product_category=payload.product_category,
        notes=payload.notes,
    )
    if not record:
        raise HTTPException(status_code=404, detail=f"Supplier {supplier_id} not found")
    logger.info("Supplier updated: %s", supplier_id)
    return {
        "supplier": record,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.delete("/{supplier_id}", summary="Delete a supplier")
async def delete_supplier(supplier_id: str) -> dict:
    """Delete a supplier permanently."""
    deleted = await supplier_store.delete(supplier_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Supplier {supplier_id} not found")
    logger.info("Supplier deleted: %s", supplier_id)
    return {
        "deleted": True,
        "supplier_id": supplier_id,
        "timestamp": datetime.utcnow().isoformat(),
    }
