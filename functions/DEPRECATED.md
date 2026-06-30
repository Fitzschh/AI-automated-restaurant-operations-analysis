# ⚠️ DEPRECATED — Do Not Use

This `functions/` directory contains the **legacy Firebase Cloud Functions** implementation of the AI analysis endpoint (`exports.aiAnalysis`).

## Status

**Fully ported** to the FastAPI backend at [`backend/ai_analysis.py`](../backend/ai_analysis.py).

All functionality from `index.js` — including system/data prompt building, OpenAI API calls, Firebase Auth verification, usage tracking, and structured error responses — has been replicated in the Python backend.

## What Replaced It

| Legacy (Cloud Functions)            | Current (FastAPI)                          |
|-------------------------------------|--------------------------------------------|
| `functions/index.js`                | `backend/ai_analysis.py`                   |
| `exports.aiAnalysis` HTTP function  | `POST /api/ai-analysis` FastAPI route      |
| `defineSecret('OPENAI_API_KEY')`    | `os.environ.get("OPENAI_API_KEY")`         |
| Firebase Functions v2 runtime       | Uvicorn + FastAPI on port 5001             |

## Why Not Deleted

Kept temporarily for reference and git history. The `"functions"` block has been **removed from `firebase.json`**, so `firebase deploy` will no longer deploy these functions.

## Cleanup

This directory can be safely deleted once the team confirms the FastAPI backend is stable in production.
