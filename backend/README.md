# AI Operations Event Gateway

Python FastAPI backend acting as the event gateway between React frontend agents and UiPath Orchestrator (future integration).

## Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Run

```bash
# Development (with auto-reload)
python main.py

# Or using uvicorn directly
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The server starts at `http://localhost:8000`.

## API Docs

Once running, interactive API docs are available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Endpoints

### `POST /event`
Receive validated agent outputs. Overwrites previous state per (branch_id, item_key).

```bash
curl -X POST http://localhost:8000/event \
  -H "Content-Type: application/json" \
  -d '{
    "event": {
      "agent_type": "OPERATIONS_MANAGER",
      "timestamp": "2026-06-18T12:00:00Z",
      "branch_id": "branch1",
      "assessments": [
        {
          "item_key": "matcha-latte",
          "item_name": "Matcha Latte",
          "issue": "Matcha Latte Inventory Depleted",
          "severity": "HIGH",
          "hours_remaining": 1.5,
          "current_stock": 3,
          "sales_velocity_per_hour": 2.0,
          "action_plan": "Increase Inventory",
          "approval_required": true
        }
      ]
    }
  }'
```

### `GET /events`
Retrieve latest processed states. Supports filtering.

```bash
# All events
curl http://localhost:8000/events

# Filter by severity
curl "http://localhost:8000/events?severity=HIGH"

# Filter by agent and branch
curl "http://localhost:8000/events?agent_type=OPERATIONS_MANAGER&branch_id=branch1"
```

### `POST /decision`
Submit human approval/rejection for action plans.

```bash
curl -X POST http://localhost:8000/decision \
  -H "Content-Type: application/json" \
  -d '{
    "branch_id": "branch1",
    "item_key": "matcha-latte",
    "decision": "APPROVED",
    "decided_by": "manager@restaurant.com",
    "decided_at": "2026-06-18T12:05:00Z",
    "notes": "Order 50 units from Supplier A"
  }'
```

### `GET /health`
Health check endpoint.

### `GET /stats`
Event store statistics.

## UiPath Integration (Future)

UiPath will consume events by:

1. **Polling** `GET /events?severity=HIGH&agent_type=OPERATIONS_MANAGER`
2. **Processing** APPROVED decisions into automation workflows
3. **Posting** outcomes back via `POST /decision`

The gateway acts as the contract boundary — UiPath never touches Firebase directly.

## Architecture

```
React Frontend Agents
        │
        ▼
FastAPI Event Gateway  ◄── You are here
        │
        ▼
UiPath Orchestrator (future)
```
