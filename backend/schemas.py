"""
Pydantic v2 schemas for the AI Operations Event Gateway.

All inputs to the FastAPI endpoints are validated through these models.
Strict typing — no free-text ambiguity.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


# ─── Enums ───────────────────────────────────────────────────────────────────

class SeverityEnum(str, Enum):
    """Inventory severity levels based on hours remaining."""
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class DecisionEnum(str, Enum):
    """Human approval decisions."""
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    PENDING = "PENDING"


class AgentTypeEnum(str, Enum):
    """Agent types in the system."""
    LIVE_OPERATIONS_ANALYST = "LIVE_OPERATIONS_ANALYST"
    OPERATIONS_MANAGER = "OPERATIONS_MANAGER"


# ─── Live Operations Analyst Schemas ─────────────────────────────────────────

class InventoryPrediction(BaseModel):
    """A single inventory depletion prediction."""
    item_key: str = Field(..., min_length=1, description="Unique key for the inventory item")
    item_name: str = Field(..., min_length=1, description="Human-readable item name")
    current_stock: int = Field(..., ge=0, description="Current stock level")
    sales_velocity_per_hour: float = Field(..., ge=0, description="Units sold per hour")
    estimated_hours_remaining: float = Field(..., ge=0, description="Projected hours until depletion")
    prediction: str = Field(..., min_length=1, description="Human-readable prediction text")


class LiveAnalystEvent(BaseModel):
    """Output from the Live Operations Analyst agent."""
    agent_type: Literal["LIVE_OPERATIONS_ANALYST"] = Field(
        ..., description="Must be LIVE_OPERATIONS_ANALYST"
    )
    timestamp: datetime = Field(..., description="When the analysis was produced")
    branch_id: str = Field(..., min_length=1, description="Branch identifier")
    predictions: list[InventoryPrediction] = Field(
        default_factory=list, description="Inventory depletion predictions"
    )
    operational_note: str = Field(
        default="", description="Summary of current operational situation"
    )


# ─── Operations Manager Schemas ──────────────────────────────────────────────

class Assessment(BaseModel):
    """A single inventory assessment with severity classification."""
    item_key: str = Field(..., min_length=1, description="Unique key for the inventory item")
    item_name: str = Field(default="", description="Human-readable item name")
    issue: str = Field(..., min_length=1, description="Description of the issue")
    severity: SeverityEnum = Field(..., description="Severity classification")
    hours_remaining: float = Field(..., ge=0, description="Estimated hours of stock remaining")
    current_stock: int = Field(default=0, ge=0, description="Current stock level")
    sales_velocity_per_hour: float = Field(default=0, ge=0, description="Sales velocity")
    action_plan: str | None = Field(
        default=None, description="Action plan text (HIGH severity only)"
    )
    approval_required: bool = Field(
        default=False, description="Whether human approval is required"
    )
    decision: DecisionEnum | None = Field(
        default=None, description="Human decision if applicable"
    )
    decided_by: str | None = Field(default=None, description="Who made the decision")
    decided_at: datetime | None = Field(default=None, description="When the decision was made")


class RevenueAnalysis(BaseModel):
    """Revenue metrics computed by the Operations Manager."""
    today_revenue: float = Field(default=0, ge=0)
    today_orders: int = Field(default=0, ge=0)
    total_revenue: float = Field(default=0, ge=0)
    total_orders: int = Field(default=0, ge=0)
    average_order_value: float = Field(default=0, ge=0)
    avg_daily_revenue: float = Field(default=0, ge=0)
    projected_daily_revenue: float = Field(default=0, ge=0)
    pace_vs_average: float = Field(default=0)


class OperationalPerformance(BaseModel):
    """Operational metrics computed by the Operations Manager."""
    total_inventory_items: int = Field(default=0, ge=0)
    high_severity_count: int = Field(default=0, ge=0)
    medium_severity_count: int = Field(default=0, ge=0)
    low_severity_count: int = Field(default=0, ge=0)
    inventory_health_score: float = Field(default=100, ge=0, le=100)
    action_plans_generated: int = Field(default=0, ge=0)


class OpsManagerEvent(BaseModel):
    """Output from the Operations Manager agent."""
    agent_type: Literal["OPERATIONS_MANAGER"] = Field(
        ..., description="Must be OPERATIONS_MANAGER"
    )
    timestamp: datetime = Field(..., description="When the analysis was produced")
    branch_id: str = Field(..., min_length=1, description="Branch identifier")
    assessments: list[Assessment] = Field(
        default_factory=list, description="Severity-classified assessments"
    )
    revenue_analysis: RevenueAnalysis | None = Field(
        default=None, description="Revenue metrics"
    )
    operational_performance: OperationalPerformance | None = Field(
        default=None, description="Operational performance metrics"
    )


# ─── Gateway Payloads ────────────────────────────────────────────────────────

class EventPayload(BaseModel):
    """
    Payload for POST /event.
    
    Accepts either a LiveAnalystEvent or OpsManagerEvent.
    The `event` field is discriminated by `agent_type`.
    """
    event: LiveAnalystEvent | OpsManagerEvent = Field(
        ..., discriminator="agent_type",
        description="Agent output event to process"
    )


class DecisionPayload(BaseModel):
    """Payload for POST /decision."""
    branch_id: str = Field(..., min_length=1, description="Branch identifier")
    item_key: str = Field(..., min_length=1, description="Item the decision applies to")
    decision: Literal["APPROVED", "REJECTED"] = Field(
        ..., description="Human decision"
    )
    decided_by: str = Field(..., min_length=1, description="Who made the decision")
    decided_at: datetime = Field(..., description="When the decision was made")
    notes: str | None = Field(default=None, description="Optional notes")


# ─── Response Models ─────────────────────────────────────────────────────────

class EventResponse(BaseModel):
    """Response model for GET /events items."""
    branch_id: str
    item_key: str
    agent_type: AgentTypeEnum
    severity: SeverityEnum | None = None
    latest_state: dict
    updated_at: datetime


class HealthResponse(BaseModel):
    """Response model for GET /health."""
    status: str = "ok"
    version: str = "1.0.0"
    description: str = "AI Operations Event Gateway"


# ─── Workflow Enums ──────────────────────────────────────────────────────────

class WorkflowStatusEnum(str, Enum):
    """Workflow lifecycle states for the two-tier approval pipeline."""
    PENDING_MANAGER = "PENDING_MANAGER"
    MANAGER_APPROVED = "MANAGER_APPROVED"
    MANAGER_REJECTED = "MANAGER_REJECTED"
    PENDING_ADMIN = "PENDING_ADMIN"
    ADMIN_APPROVED = "ADMIN_APPROVED"
    ADMIN_REJECTED = "ADMIN_REJECTED"
    PENDING_UIPATH = "PENDING_UIPATH"
    PENDING_SUPPLIER = "PENDING_SUPPLIER"
    SUPPLIER_APPROVED = "SUPPLIER_APPROVED"
    SUPPLIER_REJECTED = "SUPPLIER_REJECTED"
    COMPLETED = "COMPLETED"


class SupplierStatusEnum(str, Enum):
    """Supplier response statuses reported by UiPath."""
    NONE = "NONE"
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    TIMEOUT = "TIMEOUT"


class ApprovalLevelEnum(str, Enum):
    """Approval tiers in the two-tier workflow."""
    MANAGER = "MANAGER"
    ADMIN = "ADMIN"


# ─── Two-Tier Decision Payloads ──────────────────────────────────────────────

class ManagerDecisionPayload(BaseModel):
    """Payload for POST /decision/manager (first-tier approval)."""
    branch_id: str = Field(..., min_length=1, description="Branch identifier")
    item_key: str = Field(..., min_length=1, description="Inventory item key")
    decision: Literal["APPROVED", "REJECTED"] = Field(
        ..., description="Manager's decision"
    )
    decided_by: str = Field(..., min_length=1, description="Manager email")
    notes: str | None = Field(default=None, description="Optional notes")


class AdminDecisionPayload(BaseModel):
    """Payload for POST /decision/admin (second-tier approval, triggers UiPath)."""
    workflow_id: str = Field(..., min_length=1, description="Workflow ID to approve/reject")
    decision: Literal["APPROVED", "REJECTED"] = Field(
        ..., description="Admin's decision"
    )
    decided_by: str = Field(..., min_length=1, description="Admin email")
    notes: str | None = Field(default=None, description="Optional notes")


# ─── Supplier Schemas ────────────────────────────────────────────────────────

class SupplierPayload(BaseModel):
    """Payload for creating/updating a supplier."""
    name: str = Field(..., min_length=1, description="Supplier name")
    email: str = Field(..., min_length=3, description="Supplier email address")
    product_category: str = Field(..., min_length=1, description="Product category this supplier provides")
    notes: str = Field(default="", description="Optional notes about this supplier")


class SupplierRecord(BaseModel):
    """Full supplier record with ID and timestamps."""
    supplier_id: str
    name: str
    email: str
    product_category: str
    notes: str = ""
    created_at: datetime
    updated_at: datetime


# ─── Workflow Schemas ────────────────────────────────────────────────────────

class DecisionRecord(BaseModel):
    """Record of a single approval decision."""
    decision: Literal["APPROVED", "REJECTED"]
    decided_by: str
    decided_at: datetime
    notes: str | None = None


class SupplierResponse(BaseModel):
    """Supplier's response to a restock request."""
    status: SupplierStatusEnum
    responded_at: datetime | None = None
    notes: str | None = None


class WorkflowRecord(BaseModel):
    """Full workflow record tracking the two-tier approval pipeline."""
    workflow_id: str
    event_id: str = ""
    branch_id: str
    item_key: str
    item_name: str = ""
    severity: SeverityEnum = SeverityEnum.HIGH
    issue: str = ""
    hours_remaining: float | None = None
    action_plan: str = ""
    status: WorkflowStatusEnum = WorkflowStatusEnum.PENDING_MANAGER
    manager_decision: DecisionRecord | None = None
    admin_decision: DecisionRecord | None = None
    supplier_response: SupplierResponse | None = None
    uipath_job_id: str | None = None
    restock_amount: int = Field(default=10, ge=1, description="Units to add on supplier approval")
    created_at: datetime
    updated_at: datetime


# ─── Notification Schemas ────────────────────────────────────────────────────

class NotificationRecord(BaseModel):
    """Persistent notification for the Notification Center."""
    notification_id: str
    branch_id: str
    event_id: str | None = None
    workflow_id: str | None = None
    timestamp: datetime
    severity: SeverityEnum
    message: str
    source: Literal[
        "LIVE_OPERATIONS_ANALYST",
        "OPERATIONS_MANAGER",
        "UIPATH",
        "SYSTEM",
    ] = "SYSTEM"
    approval_status: WorkflowStatusEnum | None = None
    supplier_status: SupplierStatusEnum | None = None
    action_taken: str | None = None
    action_plan: str | None = None
    decided_by: str | None = None
    archived: bool = False


# ─── UiPath Callback Schema ─────────────────────────────────────────────────

class UiPathCallbackPayload(BaseModel):
    """Payload received from UiPath Maestro reporting supplier response."""
    workflow_id: str = Field(..., min_length=1, description="Workflow this callback relates to")
    job_id: str = Field(..., min_length=1, description="UiPath job ID")
    supplier_status: Literal["APPROVED", "REJECTED", "TIMEOUT"] = Field(
        ..., description="Supplier's response"
    )
    supplier_notes: str | None = Field(default=None, description="Notes from supplier")
    responded_at: datetime = Field(..., description="When the supplier responded")


# ─── Inbox Schema ────────────────────────────────────────────────────────────

class InboxItem(BaseModel):
    """Single item in the activity feed inbox."""
    inbox_id: str
    branch_id: str
    workflow_id: str | None = None
    timestamp: datetime
    category: Literal[
        "APPROVAL_REQUESTED",
        "APPROVAL_ACCEPTED",
        "APPROVAL_REJECTED",
        "SUPPLIER_CONFIRMATION",
        "INVENTORY_UPDATE",
        "SYSTEM",
    ]
    title: str
    message: str
    severity: SeverityEnum | None = None
    actor: str = ""
    read: bool = False


# ─── Restock Config Schema ──────────────────────────────────────────────────

class RestockConfigPayload(BaseModel):
    """Payload for configuring the default restock amount."""
    amount: int = Field(..., ge=1, le=1000, description="Default restock quantity")
