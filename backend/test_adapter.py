"""
BPMN Event Gateway Adapter — Integration Tests

Tests the adapter's translation of all BPMN event_type payloads
into correct backend API calls.

Run:
    cd backend && python -m pytest test_adapter.py -v

Requires:
    - Backend running on localhost:5001
    - Adapter running on localhost:8080
    OR
    - Use the TestClient fixtures (no external servers needed)
"""

from __future__ import annotations

import asyncio
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, patch, MagicMock

from fastapi.testclient import TestClient

# ─── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def reset_adapter_state():
    """Reset the adapter state before each test."""
    from adapter_state import adapter_state
    adapter_state._cycles = {}
    adapter_state._workflows = {}
    yield


@pytest.fixture
def client():
    """Create a TestClient for the adapter app."""
    from bpmn_adapter import app
    return TestClient(app)


def _mock_backend_response(status_code: int = 200, data: dict | None = None):
    """Create a mock backend response."""
    return {
        "status_code": status_code,
        "data": data or {"status": "ok", "timestamp": datetime.utcnow().isoformat()},
        "ok": status_code < 400,
    }


# ─── POST /event — Analyst Lane ─────────────────────────────────────────────


class TestAnalystLane:
    """Test the 4-step analyst lane: SUBSCRIBE → VELOCITY → FORECAST → BUILD_PREDICTION."""

    def test_subscribe_firebase(self, client):
        """SUBSCRIBE_FIREBASE should ACK and store context."""
        resp = client.post("/event", json={
            "event": {
                "agent_type": "LIVE_OPS_ANALYST",
                "event_type": "SUBSCRIBE_FIREBASE",
                "branch_id": "branch-001",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "accepted"
        assert data["event_type"] == "SUBSCRIBE_FIREBASE"
        assert data["adapter"] is True

    def test_compute_velocity(self, client):
        """COMPUTE_VELOCITY should ACK and store velocity data."""
        resp = client.post("/event", json={
            "event": {
                "agent_type": "LIVE_OPS_ANALYST",
                "event_type": "COMPUTE_VELOCITY",
                "branch_id": "branch-001",
                "timestamp": "2026-06-27T12:00:00Z",
                "velocity_data": {"items": 5, "avg_velocity": 2.3},
            }
        })
        assert resp.status_code == 200
        assert resp.json()["event_type"] == "COMPUTE_VELOCITY"

    def test_forecast_depletion(self, client):
        """FORECAST_DEPLETION should store per-item prediction."""
        resp = client.post("/event", json={
            "event": {
                "agent_type": "LIVE_OPS_ANALYST",
                "event_type": "FORECAST_DEPLETION",
                "branch_id": "branch-001",
                "timestamp": "2026-06-27T12:00:00Z",
                "item_key": "chicken-wings",
                "item_name": "Chicken Wings",
                "current_stock": 15,
                "sales_velocity_per_hour": 5.0,
                "hours_remaining": 3.0,
            }
        })
        assert resp.status_code == 200
        assert resp.json()["item_key"] == "chicken-wings"

    @patch("bpmn_adapter.backend_request")
    def test_build_prediction_sends_to_backend(self, mock_backend, client):
        """BUILD_PREDICTION should assemble predictions and POST to backend."""
        # Setup: first add a forecast
        client.post("/event", json={
            "event": {
                "agent_type": "LIVE_OPS_ANALYST",
                "event_type": "FORECAST_DEPLETION",
                "branch_id": "branch-001",
                "item_key": "chicken-wings",
                "item_name": "Chicken Wings",
                "current_stock": 15,
                "sales_velocity_per_hour": 5.0,
                "hours_remaining": 3.0,
                "prediction": "Chicken Wings will last approximately 3 hours",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })

        # Mock the backend response
        mock_backend.return_value = _mock_backend_response(200, {
            "status": "accepted",
            "items_processed": 1,
            "workflows_created": 0,
        })

        # Act
        resp = client.post("/event", json={
            "event": {
                "agent_type": "LIVE_OPS_ANALYST",
                "event_type": "BUILD_PREDICTION",
                "branch_id": "branch-001",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })

        assert resp.status_code == 200
        data = resp.json()
        assert data["predictions_sent"] == 1

        # Verify the backend was called with LIVE_OPERATIONS_ANALYST (not LIVE_OPS_ANALYST)
        mock_backend.assert_called()
        call_args = mock_backend.call_args
        payload = call_args.kwargs.get("json_body") or call_args[1].get("json_body", {})
        assert payload["event"]["agent_type"] == "LIVE_OPERATIONS_ANALYST"
        assert len(payload["event"]["predictions"]) == 1


# ─── POST /event — Operations Manager Lane ──────────────────────────────────


class TestOpsManagerLane:
    """Test the 4-step manager lane: CLASSIFY → PLANS → REVENUE → BUILD_MANAGER_OUTPUT."""

    def test_classify_severity(self, client):
        """CLASSIFY_SEVERITY should store classification and ACK."""
        resp = client.post("/event", json={
            "event": {
                "agent_type": "OPERATIONS_MANAGER",
                "event_type": "CLASSIFY_SEVERITY",
                "branch_id": "branch-001",
                "item_key": "chicken-wings",
                "item_name": "Chicken Wings",
                "severity": "HIGH",
                "hours_remaining": 1.5,
                "current_stock": 5,
                "issue": "Chicken Wings Low Stock",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })
        assert resp.status_code == 200
        assert resp.json()["severity"] == "HIGH"

    def test_generate_action_plans(self, client):
        """GENERATE_ACTION_PLANS should store plans and ACK."""
        resp = client.post("/event", json={
            "event": {
                "agent_type": "OPERATIONS_MANAGER",
                "event_type": "GENERATE_ACTION_PLANS",
                "branch_id": "branch-001",
                "item_key": "chicken-wings",
                "action_plan": "Emergency restock Chicken Wings",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })
        assert resp.status_code == 200

    @patch("bpmn_adapter.backend_request")
    def test_build_manager_output_sends_to_backend(self, mock_backend, client):
        """BUILD_MANAGER_OUTPUT should assemble assessments and POST to backend."""
        # Setup: classify + generate plans
        client.post("/event", json={
            "event": {
                "agent_type": "OPERATIONS_MANAGER",
                "event_type": "CLASSIFY_SEVERITY",
                "branch_id": "branch-001",
                "item_key": "chicken-wings",
                "item_name": "Chicken Wings",
                "severity": "HIGH",
                "hours_remaining": 1.5,
                "current_stock": 5,
                "issue": "Chicken Wings Low Stock",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })
        client.post("/event", json={
            "event": {
                "agent_type": "OPERATIONS_MANAGER",
                "event_type": "GENERATE_ACTION_PLANS",
                "branch_id": "branch-001",
                "item_key": "chicken-wings",
                "action_plan": "Emergency restock Chicken Wings",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })

        mock_backend.return_value = _mock_backend_response(200, {
            "status": "accepted",
            "items_processed": 1,
            "workflows_created": 1,
        })

        resp = client.post("/event", json={
            "event": {
                "agent_type": "OPERATIONS_MANAGER",
                "event_type": "BUILD_MANAGER_OUTPUT",
                "branch_id": "branch-001",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })

        assert resp.status_code == 200
        data = resp.json()
        assert data["assessments_sent"] == 1

        # Verify backend was called with OPERATIONS_MANAGER
        # The first call is POST /event; subsequent calls may be GET /workflows
        assert mock_backend.call_count >= 1
        first_call = mock_backend.call_args_list[0]
        payload = first_call.kwargs.get("json_body") or (first_call[1].get("json_body", {}) if len(first_call) > 1 else {})
        assert payload["event"]["agent_type"] == "OPERATIONS_MANAGER"
        assert len(payload["event"]["assessments"]) == 1
        assert payload["event"]["assessments"][0]["approval_required"] is True


# ─── POST /event — Backend Persistence (ACK-only) ───────────────────────────


class TestBackendPersistence:
    """Test that all 28 BACKEND event_types return ACKs without failing."""

    @pytest.mark.parametrize("event_type", [
        "CREATE_DASHBOARD_NOTIFICATION",
        "STORE_NOTIFICATION",
        "CREATE_APPROVAL_NOTIFICATION",
        "CREATE_INBOX_ENTRY",
        "CREATE_REJECTION_NOTIFICATION",
        "CREATE_ESCALATION_NOTIFICATION",
        "CLEAR_TOAST",
        "CREATE_UIPATH_NOTIFICATION",
        "TRIGGER_UIPATH_MAESTRO",
        "RECORD_UIPATH_JOB_ID",
        "CREATE_COMPLETION_NOTIFICATION",
    ])
    def test_ack_only_events(self, client, event_type):
        """All ACK-only BACKEND events should return 200 with adapter=True."""
        resp = client.post("/event", json={
            "event": {
                "agent_type": "BACKEND",
                "event_type": event_type,
                "branch_id": "branch-001",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["adapter"] is True
        assert data["event_type"] == event_type

    def test_create_workflow_record_stores_context(self, client):
        """CREATE_WORKFLOW_RECORD should store workflow context."""
        resp = client.post("/event", json={
            "event": {
                "agent_type": "BACKEND",
                "event_type": "CREATE_WORKFLOW_RECORD",
                "branch_id": "branch-001",
                "workflow_id": "wf_test123",
                "item_key": "chicken-wings",
                "status": "PENDING_MANAGER",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })
        assert resp.status_code == 200
        assert resp.json()["workflow_id"] == "wf_test123"

    def test_update_workflow_stores_status(self, client):
        """UPDATE_WORKFLOW should store the new status."""
        # Setup: create workflow first
        client.post("/event", json={
            "event": {
                "agent_type": "BACKEND",
                "event_type": "CREATE_WORKFLOW_RECORD",
                "branch_id": "branch-001",
                "workflow_id": "wf_test123",
                "status": "PENDING_MANAGER",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })

        resp = client.post("/event", json={
            "event": {
                "agent_type": "BACKEND",
                "event_type": "UPDATE_WORKFLOW",
                "branch_id": "branch-001",
                "workflow_id": "wf_test123",
                "status": "PENDING_ADMIN",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })
        assert resp.status_code == 200

    @patch("bpmn_adapter.backend_request")
    def test_lookup_supplier_fetches_from_backend(self, mock_backend, client):
        """LOOKUP_SUPPLIER should call GET /suppliers and return data."""
        mock_backend.return_value = _mock_backend_response(200, {
            "suppliers": [
                {"supplier_id": "sup_1", "name": "Fresh Foods Co", "email": "orders@freshfoods.com"}
            ],
            "count": 1,
        })

        resp = client.post("/event", json={
            "event": {
                "agent_type": "BACKEND",
                "event_type": "LOOKUP_SUPPLIER",
                "branch_id": "branch-001",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["suppliers_found"] == 1
        assert data["supplier"]["name"] == "Fresh Foods Co"


# ─── POST /event — UiPath Maestro Lane ──────────────────────────────────────


class TestUiPathMaestroLane:
    """Test RETRIEVE_SUPPLIER, COMPOSE_EMAIL, PROCESS_SUPPLIER_RESPONSE."""

    @patch("bpmn_adapter.backend_request")
    def test_retrieve_supplier(self, mock_backend, client):
        """RETRIEVE_SUPPLIER should fetch suppliers like LOOKUP_SUPPLIER."""
        mock_backend.return_value = _mock_backend_response(200, {
            "suppliers": [{"name": "Test Supplier", "email": "test@supplier.com"}],
            "count": 1,
        })

        resp = client.post("/event", json={
            "event": {
                "agent_type": "UIPATH_MAESTRO",
                "event_type": "RETRIEVE_SUPPLIER",
                "branch_id": "branch-001",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })
        assert resp.status_code == 200
        assert resp.json()["suppliers_found"] == 1

    def test_compose_email(self, client):
        """COMPOSE_EMAIL should store email details and ACK."""
        resp = client.post("/event", json={
            "event": {
                "agent_type": "UIPATH_MAESTRO",
                "event_type": "COMPOSE_EMAIL",
                "branch_id": "branch-001",
                "subject": "Restock Request - Chicken Wings",
                "body": "Please restock 20 units of Chicken Wings",
                "item_name": "Chicken Wings",
                "restock_amount": 20,
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })
        assert resp.status_code == 200

    def test_process_supplier_response(self, client):
        """PROCESS_SUPPLIER_RESPONSE should store supplier decision."""
        resp = client.post("/event", json={
            "event": {
                "agent_type": "UIPATH_MAESTRO",
                "event_type": "PROCESS_SUPPLIER_RESPONSE",
                "branch_id": "branch-001",
                "supplier_decision": "APPROVED",
                "supplier_notes": "Order confirmed",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })
        assert resp.status_code == 200
        assert resp.json()["decision"] == "APPROVED"


# ─── POST /decision/manager — Manager Decision ──────────────────────────────


class TestManagerDecision:
    """Test manager decision translation."""

    @patch("bpmn_adapter.backend_request")
    def test_minimal_payload_with_context(self, mock_backend, client):
        """Manager decision with workflow context should enrich and proxy."""
        # Setup: store workflow context
        client.post("/event", json={
            "event": {
                "agent_type": "BACKEND",
                "event_type": "CREATE_WORKFLOW_RECORD",
                "branch_id": "branch-001",
                "workflow_id": "wf_test123",
                "item_key": "chicken-wings",
                "status": "PENDING_MANAGER",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })

        mock_backend.return_value = _mock_backend_response(200, {
            "workflow_id": "wf_test123",
            "status": "PENDING_ADMIN",
            "next_step": "PENDING_ADMIN",
        })

        resp = client.post("/decision/manager", json={
            "decision": "APPROVED",
            "decided_by": "manager@restaurant.com",
            "branch_id": "branch-001",
            "item_key": "chicken-wings",
        })

        assert resp.status_code == 200
        mock_backend.assert_called_once()

    def test_missing_context_returns_422(self, client):
        """Manager decision without resolvable context should fail gracefully."""
        resp = client.post("/decision/manager", json={
            "decision": "APPROVED",
        })
        assert resp.status_code == 422
        assert "Cannot resolve" in resp.json()["error"]


# ─── POST /decision/admin — Admin Decision ──────────────────────────────────


class TestAdminDecision:
    """Test admin decision translation."""

    @patch("bpmn_adapter.backend_request")
    def test_with_workflow_id(self, mock_backend, client):
        """Admin decision with workflow_id should proxy directly."""
        mock_backend.return_value = _mock_backend_response(200, {
            "workflow_id": "wf_test123",
            "status": "PENDING_UIPATH",
            "uipath_triggered": True,
        })

        resp = client.post("/decision/admin", json={
            "workflow_id": "wf_test123",
            "decision": "APPROVED",
            "decided_by": "admin@restaurant.com",
        })

        assert resp.status_code == 200

    @patch("bpmn_adapter.backend_request")
    def test_resolves_workflow_from_state(self, mock_backend, client):
        """Admin decision without workflow_id should resolve from adapter state."""
        # Setup: store workflow context in cycle
        from adapter_state import adapter_state
        asyncio.get_event_loop().run_until_complete(
            adapter_state.update_cycle("branch-001", {"workflow_id": "wf_resolved"})
        )

        mock_backend.return_value = _mock_backend_response(200, {
            "workflow_id": "wf_resolved",
            "status": "ADMIN_REJECTED",
        })

        resp = client.post("/decision/admin", json={
            "decision": "REJECTED",
            "decided_by": "admin@restaurant.com",
            "branch_id": "branch-001",
        })

        assert resp.status_code == 200


# ─── POST /uipath/callback — UiPath Callback ────────────────────────────────


class TestUiPathCallback:
    """Test UiPath callback translation (adds missing job_id)."""

    @patch("bpmn_adapter.backend_request")
    def test_adds_missing_job_id(self, mock_backend, client):
        """Callback without job_id should get a generated fallback."""
        mock_backend.return_value = _mock_backend_response(200, {
            "status": "COMPLETED",
            "workflow_id": "wf_test123",
            "supplier_status": "APPROVED",
        })

        resp = client.post("/uipath/callback", json={
            "workflow_id": "wf_test123",
            "supplier_status": "APPROVED",
            "supplier_notes": "Order confirmed",
            "responded_at": "2026-06-27T12:00:00Z",
        })

        assert resp.status_code == 200
        # Verify job_id was added
        call_args = mock_backend.call_args
        payload = call_args.kwargs.get("json_body") or call_args[1].get("json_body", {})
        assert "job_id" in payload
        assert payload["job_id"] == "bpmn_wf_test123"

    @patch("bpmn_adapter.backend_request")
    def test_preserves_existing_job_id(self, mock_backend, client):
        """Callback with job_id should pass it through."""
        mock_backend.return_value = _mock_backend_response(200, {
            "status": "COMPLETED",
        })

        resp = client.post("/uipath/callback", json={
            "workflow_id": "wf_test123",
            "job_id": "real_job_456",
            "supplier_status": "APPROVED",
            "responded_at": "2026-06-27T12:00:00Z",
        })

        assert resp.status_code == 200
        call_args = mock_backend.call_args
        payload = call_args.kwargs.get("json_body") or call_args[1].get("json_body", {})
        assert payload["job_id"] == "real_job_456"


# ─── POST /supplier/email — Supplier Email ──────────────────────────────────


class TestSupplierEmail:
    """Test the adapter-only /supplier/email endpoint."""

    def test_supplier_email_returns_200(self, client):
        """POST /supplier/email should always succeed."""
        resp = client.post("/supplier/email", json={
            "supplier_email": "orders@freshfoods.com",
            "supplier_name": "Fresh Foods Co",
            "subject": "Restock Request - Chicken Wings",
            "body": "Please restock 20 units",
            "item_name": "Chicken Wings",
            "branch_id": "branch-001",
            "restock_amount": 20,
        })

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "sent"
        assert data["supplier_email"] == "orders@freshfoods.com"
        assert data["restock_amount"] == 20


# ─── Health Check ────────────────────────────────────────────────────────────


class TestHealth:
    """Test health endpoint."""

    @patch("bpmn_adapter.backend_request")
    def test_health_check(self, mock_backend, client):
        """Health check should return adapter status."""
        mock_backend.return_value = _mock_backend_response(200, {
            "status": "ok",
            "version": "1.0.0",
        })

        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["adapter"] is True
        assert data["backend_healthy"] is True


# ─── Unknown Event Types ────────────────────────────────────────────────────


class TestUnknownEvents:
    """Test graceful handling of unknown event_types."""

    def test_unknown_event_type_acks(self, client):
        """Unknown event_type should ACK (not fail) to avoid BPMN errors."""
        resp = client.post("/event", json={
            "event": {
                "agent_type": "FUTURE_AGENT",
                "event_type": "SOME_NEW_EVENT",
                "branch_id": "branch-001",
                "timestamp": "2026-06-27T12:00:00Z",
            }
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "warning" in data
        assert data["adapter"] is True
