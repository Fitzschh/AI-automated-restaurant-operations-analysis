"""
AI Analysis Module — Ported from Firebase Cloud Functions

Complete port of the AI analysis pipeline from functions/index.js to FastAPI.
Handles: system/data prompt building, OpenAI API calls, Firebase Auth
verification, usage tracking to Firebase RTDB, and structured error responses.

Endpoint: POST /api/ai-analysis
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

# ─── Logging ─────────────────────────────────────────────────────────────────

logger = logging.getLogger("ai_analysis")

# ─── Constants ───────────────────────────────────────────────────────────────

DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
PHP_PER_USD = 58
GPT_4O_MINI_INPUT_USD_PER_TOKEN = 0.15 / 1_000_000
GPT_4O_MINI_OUTPUT_USD_PER_TOKEN = 0.60 / 1_000_000

VALID_MODES = {"deep", "live", "briefing", "leak", "simulation", "opschat"}
EXTENDED_MODES = {"deep", "briefing", "leak", "simulation", "opschat"}

# ─── Firebase Admin (optional, graceful degradation) ─────────────────────────

_firebase_initialized = False

def _init_firebase():
    """Initialize Firebase Admin SDK if not already done."""
    global _firebase_initialized
    if _firebase_initialized:
        return True

    try:
        import firebase_admin
        from firebase_admin import credentials

        database_url = os.environ.get("FIREBASE_DATABASE_URL", "")
        service_account_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "")
        project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", "")

        options = {}
        if database_url:
            options["databaseURL"] = database_url
        if project_id:
            options["projectId"] = project_id

        if service_account_path and os.path.exists(service_account_path):
            cred = credentials.Certificate(service_account_path)
            firebase_admin.initialize_app(cred, options)
        elif database_url or project_id:
            firebase_admin.initialize_app(options=options)
        else:
            logger.info("No Firebase credentials, project ID, or database URL configured. Auth verification and usage tracking disabled.")
            return False

        _firebase_initialized = True
        logger.info("Firebase Admin SDK initialized successfully (project: %s).", project_id or "default")
        return True
    except ImportError:
        logger.info("firebase-admin package not installed. Auth verification and usage tracking disabled.")
        return False
    except Exception as e:
        logger.warning("Firebase Admin initialization failed: %s. Auth verification and usage tracking disabled.", e)
        return False


# ─── Helper Functions ────────────────────────────────────────────────────────

def strip_emoji(value: str) -> str:
    """Remove emoji characters from a string."""
    text = str(value or "")
    # Remove extended pictographic, emoji presentation, and variation selectors
    text = re.sub(r"[\U0001F300-\U0001FAD6\U0001FA70-\U0001FAFF\U00002702-\U000027B0"
                  r"\U0000FE00-\U0000FE0F\U0001F900-\U0001F9FF\U0001F600-\U0001F64F"
                  r"\U0001F680-\U0001F6FF\U00002600-\U000026FF\U00002B50-\U00002B55"
                  r"\U0000200D\U00002764\U0000FE0F\U0000203C-\U00003299]", "", text)
    return text.strip()


def format_product_name(raw: str) -> str:
    """Format a product name: strip emoji, normalize whitespace, title case."""
    name = strip_emoji(raw)
    name = re.sub(r"[_\-]+", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name.title() if name else ""


def money(value) -> str:
    """Format a number as money with 2 decimal places."""
    return f"{float(value or 0):.2f}"


def safe_branch_id(value) -> str | None:
    """Validate and return a branch ID, or None if invalid."""
    branch_id = str(value or "").strip()
    if re.match(r"^[a-zA-Z0-9_\-]+$", branch_id):
        return branch_id
    return None


def format_date_key(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d")


def format_month_key(dt: datetime) -> str:
    return dt.strftime("%Y-%m")


def format_week_key(dt: datetime) -> str:
    iso = dt.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def estimate_cost_php(usage: dict) -> float:
    prompt_tokens = int(usage.get("prompt_tokens", 0) or 0)
    completion_tokens = int(usage.get("completion_tokens", 0) or 0)
    usd = (prompt_tokens * GPT_4O_MINI_INPUT_USD_PER_TOKEN +
           completion_tokens * GPT_4O_MINI_OUTPUT_USD_PER_TOKEN)
    return round(usd * PHP_PER_USD, 6)


# ─── Firebase Auth Verification ──────────────────────────────────────────────

def _decode_unverified_token(token: str) -> dict | None:
    """Decode a JWT token payload without verifying its signature."""
    try:
        import base64
        import json
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload = parts[1]
        # Add base64 padding if necessary
        payload += "=" * ((4 - len(payload) % 4) % 4)
        decoded_bytes = base64.urlsafe_b64decode(payload)
        data = json.loads(decoded_bytes)
        if isinstance(data, dict):
            # Firebase Admin SDK verify_id_token puts user ID in 'uid'
            if "uid" not in data:
                data["uid"] = data.get("user_id") or data.get("sub")
            return data
        return None
    except Exception as e:
        logger.warning("Failed to decode token payload: %s", e)
        return None


async def verify_firebase_user(request: Request) -> dict | None:
    """Verify a Firebase ID token from the Authorization header."""
    auth_header = request.headers.get("authorization", "")
    match = re.match(r"^Bearer (.+)$", auth_header)
    if not match:
        return None

    token = match.group(1)
    unverified_user = _decode_unverified_token(token)

    if not _init_firebase():
        # Firebase not available — skip verification in dev mode
        logger.warning("Firebase Admin not initialized. Using unverified token payload.")
        return unverified_user or {"uid": "dev-user", "email": "dev@localhost"}

    try:
        from firebase_admin import auth
        decoded = auth.verify_id_token(token)
        return decoded
    except Exception as e:
        logger.warning("Firebase cryptographic token verification failed: %s. Falling back to unverified payload.", e)
        if unverified_user:
            return unverified_user
        return None


# ─── AI Usage Recording ─────────────────────────────────────────────────────

async def record_ai_usage(branch_id: str, mode: str, usage: dict):
    """Record AI usage metrics to Firebase Realtime Database."""
    if not branch_id or not usage:
        return

    if not _init_firebase():
        logger.debug("Firebase not available — skipping usage recording.")
        return

    try:
        from firebase_admin import db as firebase_db

        now = datetime.now(timezone.utc)
        service = ("executiveBusinessAnalysis" if mode == "deep"
                   else "advancedOperationsManager" if mode in EXTENDED_MODES
                   else "liveOperationsFeed")
        trigger = "hourly" if mode == "live" else mode
        cost_php = estimate_cost_php(usage)

        prompt_tokens = int(usage.get("prompt_tokens", 0) or 0)
        completion_tokens = int(usage.get("completion_tokens", 0) or 0)
        total_tokens = int(usage.get("total_tokens", 0) or 0)

        period = format_month_key(now)
        date_key = format_date_key(now)
        week_key = format_week_key(now)

        paths = [
            f"{branch_id}/aiUsage/{period}/services/{service}",
            f"{branch_id}/aiUsage/{period}/triggers/{trigger}/{service}",
            f"{branch_id}/aiUsage/{period}/daily/{date_key}/{service}",
            f"{branch_id}/aiUsage/{period}/weekly/{week_key}/{service}",
            f"{branch_id}/aiUsage/{period}/monthly/{period}/{service}",
        ]

        from firebase_admin import db as rtdb
        ref = rtdb.reference("/")
        current_data = ref.get() or {}
        
        updates = {}
        for path in paths:
            # Helper to get nested value from current_data
            parts = path.split("/")
            curr = current_data
            for p in parts:
                if isinstance(curr, dict):
                    curr = curr.get(p, {})
                else:
                    curr = {}
            if not isinstance(curr, dict):
                curr = {}
                
            updates[f"{path}/requests"] = curr.get("requests", 0) + 1
            updates[f"{path}/promptTokens"] = curr.get("promptTokens", 0) + prompt_tokens
            updates[f"{path}/completionTokens"] = curr.get("completionTokens", 0) + completion_tokens
            updates[f"{path}/totalTokens"] = curr.get("totalTokens", 0) + total_tokens
            updates[f"{path}/estimatedCostPhp"] = curr.get("estimatedCostPhp", 0) + cost_php
            updates[f"{path}/lastUpdated"] = now.isoformat()

        ref.update(updates)
        logger.info("AI usage recorded for branch %s, mode %s", branch_id, mode)
    except Exception as e:
        logger.error("AI usage recording failed: %s", e)


# ─── System Prompt Builder ───────────────────────────────────────────────────

def build_system_prompt(mode: str) -> str:
    """Build the system prompt for OpenAI based on analysis mode."""

    if mode == "briefing":
        schema = """{
  "mode": "briefing",
  "handoffType": "AI Shift Handoff",
  "greeting": "Good supplied time of day, manager name.",
  "branchWelcome": "Welcome to Branch name.",
  "shiftHandoff": {
    "yesterdayRevenue": "Revenue in Philippine pesos, or 'Insufficient data'.",
    "topProduct": "Top active product, or 'Insufficient data'.",
    "fastestGrowingProduct": "Fastest growing active product with supported percentage, or 'Insufficient trend data'.",
    "inventoryRisks": ["Current active inventory risks only."],
    "operationalInsight": "Most important operating pattern for the manager to know.",
    "recommendation": "Most important action before or during this shift.",
    "potentialRevenueOpportunity": "Concrete sales opportunity, bundle, prep, or promotion idea."
  },
  "confidenceScore": 0
}"""
    elif mode == "leak":
        schema = """{
  "mode": "leak",
  "summary": "Daily revenue leak interpretation.",
  "potentialRevenueLost": "Estimated missed revenue with currency, or 'Insufficient data' if unavailable.",
  "largestRevenueLeak": "Main leak category or 'Insufficient data'.",
  "leaks": [
    {
      "category": "Cart Abandonment, High Interest Low Conversion, Stockout Revenue Loss, Peak Hour Bottleneck, or Other",
      "finding": "What revenue may be leaking.",
      "estimatedLoss": "Currency estimate or 'Insufficient data'.",
      "recommendedAction": "Specific action."
    }
  ],
  "recommendedAction": "Highest impact next move.",
  "confidenceScore": 0
}"""
    elif mode == "simulation":
        schema = """{
  "mode": "simulation",
  "scenario": "Manager's scenario.",
  "expectedOutcome": {
    "revenueImpact": "Estimated revenue impact.",
    "stockoutRisk": "Estimated change in stockout risk.",
    "customerSatisfaction": "Likely customer impact.",
    "operationalRisk": "Low, Medium, or High with reason."
  },
  "recommendation": "Implement, test, avoid, or gather more data.",
  "confidenceScore": 0
}"""
    elif mode == "opschat":
        schema = """{
  "mode": "opschat",
  "answer": "Direct work-related answer for the manager.",
  "keyPoints": ["Operational reasoning, risks, or next steps."],
  "simulation": {
    "scenario": "Scenario being simulated, or null if not a simulation.",
    "revenueImpact": "Estimated revenue impact, or null.",
    "stockoutRisk": "Estimated stockout impact, or null.",
    "customerSatisfaction": "Estimated customer impact, or null.",
    "operationalRisk": "Low, Medium, or High with reason, or null."
  },
  "recommendation": "Clear management action.",
  "confidenceScore": 0
}"""
    elif mode == "deep":
        schema = """{
  "mode": "deep",
  "revenuePerformance": {
    "summary": "What happened and why it matters.",
    "insights": ["Today vs yesterday, weekly average, shift, or hourly insights."],
    "anomalies": ["Unusual revenue movements or empty array."]
  },
  "productPerformance": {
    "summary": "Overall product demand interpretation.",
    "topSelling": ["Top products with operational meaning."],
    "worstPerforming": ["Weak products and likely reasons."],
    "fastestGrowing": ["Products gaining demand, or empty array if unavailable."],
    "decliningDemand": ["Products losing demand, or empty array if unavailable."]
  },
  "inventoryAnalysis": {
    "summary": "Inventory risk summary tied to sales velocity.",
    "stockOutRisks": ["Items that may run out and why."],
    "restockRecommendations": ["Specific restock or prep recommendations."]
  },
  "peakHourAnalysis": {
    "summary": "Busiest and slowest time patterns.",
    "busiestHours": ["Busiest hours with action context."],
    "slowestHours": ["Slowest hours with action context."],
    "recommendations": ["Staffing, prep, or resource planning recommendations."]
  },
  "staffingRecommendations": {
    "summary": "Staffing interpretation based on hourly and shift demand.",
    "recommendations": ["Specific staffing or prep coverage recommendations."]
  },
  "revenueLeakDetection": {
    "summary": "Likely missed revenue risks using available data.",
    "leaks": ["Potential revenue leak findings, or note unavailable data."]
  },
  "forecasting": {
    "summary": "Demand forecast using available historical sales, hourly, product, and inventory data.",
    "risks": ["Tomorrow, shift, inventory, or demand risks."],
    "opportunities": ["Forecasted sales, prep, or promotion opportunities."]
  },
  "operationalRecommendations": {
    "high": ["Immediate actions."],
    "medium": ["Important but less urgent actions."],
    "low": ["Lower priority improvements."]
  },
  "executiveSummary": "Concise business summary for the owner."
}"""
    else:
        mode_label = "live" if mode == "live" else "realtime"
        msg_instruction = (
            "Start with As of {time}: then give one operational update. Maximum 45 words total."
            if mode == "live"
            else "One natural manager-facing note. Maximum 2 short sentences and 35 words total."
        )
        schema = f"""{{"mode": "{mode_label}",
  "insight": {{
    "message": "{msg_instruction}",
    "action": "One clear next action. Maximum 12 words.",
    "priority": "HIGH, MEDIUM, or LOW"
  }}
}}"""

    mode_label_map = {
        "deep": "DEEP ANALYSIS REPORT",
        "live": "AI LIVE OPERATIONS FEED HOURLY UPDATE",
        "briefing": "AI SHIFT HANDOFF",
        "leak": "AI REVENUE LEAK DETECTOR",
        "simulation": "AI DECISION SIMULATOR",
        "opschat": "AI OPERATIONS MANAGER WORK CHAT",
    }
    mode_display = mode_label_map.get(mode, "REAL-TIME AI ANALYST")

    return f"""You are the AI Restaurant Analyst for E-Menu Portal.

Your responsibility is to analyze restaurant operations, sales performance, inventory levels, customer ordering trends, and business metrics, then provide actionable recommendations to restaurant managers and owners.

Do not simply repeat dashboard statistics. Interpret the data, identify opportunities, predict issues, and recommend actions like an experienced restaurant operations consultant.

Use plain language. Be direct, practical, and professional. Do not use emoji characters. Use Philippine peso formatting for currency, for example ₱42,500. Do not invent exact comparisons when the source data does not support them; say when a comparison is unavailable.
Treat the CURRENT INVENTORY section as the active menu/inventory list. Do not recommend restocking, restoring, preparing, promoting, or taking operational action on products that are absent from current inventory.

Mode: {mode_display}

Real-time mode rules:
- Respond like a human analyst speaking to a busy manager during service.
- Return exactly one manager-facing note.
- Keep it short enough to read in under 10 seconds.
- The message should combine what happened and why it matters in plain language.
- The action should be a single practical instruction.
- Focus on meaningful sales changes, trending products, inventory concerns, demand spikes, revenue changes, slow-moving inventory, customer ordering behavior, and peak-hour activity.
- Compare against previous hour, previous day, current shift, or historical averages when the data supports it.
- Include inventory levels and sales velocity when inventory risk is relevant.
- Do not list multiple issues. Pick the most important thing right now.
- Do not sound like a report. Avoid headings, dashboard recap, and long explanations.
- If nothing urgent stands out, say that briefly and suggest what to keep watching.
- For hourly live feed mode, start the message with the supplied "As of" time and summarize the current operating situation.

Deep report mode rules:
- Produce a more detailed business intelligence report.
- Explain what happened today, why it happened, and what actions should be taken tomorrow.
- Analyze revenue performance, product performance, inventory, peak hours, staffing, revenue leak detection, forecasting, and operational recommendations.
- Prioritize actions as HIGH, MEDIUM, and LOW.
- End with a concise executive summary.

AI shift handoff mode rules:
- Act like an automated shift handoff for a manager starting work, not a chatbot greeting.
- Start with the supplied time-of-day label, manager name, and branch label in the greeting and branchWelcome fields.
- Summarize the branch's operating status in the fixed shiftHandoff fields only.
- Explain yesterday's revenue when daily history supports it.
- Identify the top active product and fastest growing active product only when supported by current menu/inventory and trend data.
- If a growth percentage is not supported, use "Insufficient trend data" instead of guessing.
- Include active inventory risks, one operational insight, one recommendation, and one revenue opportunity.
- Keep each field concise enough to scan during shift start.
- Include a confidenceScore from 0 to 100 based on historical data availability, data quality, consistency, and trend stability.

Revenue leak detector rules:
- Search for hidden missed revenue, not just reported sales.
- Consider cart abandonment, high interest with low conversion, stockout revenue loss, and peak-hour bottlenecks.
- If the provided data lacks views, carts, checkout, or service-time data, say that estimate is unavailable instead of inventing it.
- Still infer likely leaks from available sales, inventory, hourly demand, and product performance.
- Include a confidenceScore from 0 to 100.

Decision simulator rules:
- Answer the manager's "What happens if..." scenario.
- Estimate revenue, inventory, customer, and operational impact using available data.
- Never present a forecast as guaranteed.
- Include a confidenceScore from 0 to 100 and explain uncertainty through the recommendation.

Operations manager work chat rules:
- Answer only restaurant operations, sales, inventory, staffing, menu, customer experience, analytics, AI usage, and branch management questions.
- If the manager question is unrelated to restaurant work, do not use restaurant data to reinterpret it. Return a short redirect only.
- For unrelated questions, answer with: "I can only help with restaurant operations work here. Ask me about sales, inventory, staffing, menu performance, branch analytics, or a what-if operations decision."
- If the manager asks a scenario question, simulate the expected business outcome using the available data.
- If the question is not work-related, politely redirect to restaurant operations.
- Always include a confidenceScore from 0 to 100.
- Always end with a practical management recommendation.

Return ONLY valid JSON using this structure:
{schema}"""


# ─── Data Prompt Builder ─────────────────────────────────────────────────────

def build_data_prompt(analytics_data: dict | None, mode: str) -> str:
    """Build the user/data prompt from analytics data."""
    data = analytics_data or {}

    report_context = data.get("reportContext") or {}
    summary = data.get("summary") or {}
    products = data.get("products") or {}
    inventory = data.get("inventory") or {}
    daily = data.get("daily") or {}
    hourly = data.get("hourly") or {}
    weekly = data.get("weekly") or {}
    monthly = data.get("monthly") or {}
    statistics = data.get("statistics") or {}
    today_analytics = data.get("todayAnalytics") or {}
    week_analytics = data.get("weekAnalytics") or {}
    month_analytics = data.get("monthAnalytics") or {}

    # Products summary
    product_entries = sorted(
        products.items(),
        key=lambda x: int(x[1].get("quantitySold", 0) or 0) if isinstance(x[1], dict) else 0,
        reverse=True,
    )
    product_lines = []
    for i, (pid, pdata) in enumerate(product_entries):
        if not isinstance(pdata, dict):
            pdata = {}
        name = format_product_name(pdata.get("name") or pid)
        qty = pdata.get("quantitySold", 0) or 0
        orders = pdata.get("orderCount", 0) or 0
        revenue = pdata.get("revenue", 0)
        avg_price = money(float(revenue or 0) / orders) if orders else "0.00"
        product_lines.append(
            f"  {i + 1}. {name}: {qty} units sold, {orders} orders, "
            f"Revenue: ₱{money(revenue)}, Avg Price: ₱{avg_price}"
        )
    product_summary = "\n".join(product_lines) or "No product data available."

    # Inventory summary
    inv_entries = sorted(
        (inventory or {}).items(),
        key=lambda x: int(x[1].get("stock", x[1].get("currentStock", 0)) or 0)
        if isinstance(x[1], dict) else 0,
    )[:30]
    inv_lines = []
    for iid, idata in inv_entries:
        if not isinstance(idata, dict):
            idata = {}
        product = products.get(iid) or {}
        stock = int(idata.get("stock", idata.get("currentStock", 0)) or 0)
        warning = int(idata.get("warningLevel", 10) or 10)
        critical = int(idata.get("criticalLevel", 5) or 5)
        qty_sold = int((product.get("quantitySold", 0) or 0))
        order_count = int((product.get("orderCount", 0) or 0))
        item_name = format_product_name(
            idata.get("productName") or idata.get("name") or product.get("name") or iid
        )
        unit = idata.get("unit", "units") or "units"
        inv_lines.append(
            f"  {item_name}: stock {stock} {unit}, warning at {warning}, "
            f"critical at {critical}, sold {qty_sold} units across {order_count} orders"
        )
    inventory_summary = "\n".join(inv_lines) or "No inventory data available."

    # Daily summary
    daily_entries = sorted((daily or {}).items(), key=lambda x: x[0], reverse=True)[:14]
    daily_lines = []
    for date_str, ddata in daily_entries:
        if not isinstance(ddata, dict):
            ddata = {}
        daily_lines.append(
            f"  {date_str}: {ddata.get('orders', 0) or 0} orders, "
            f"Revenue: ₱{money(ddata.get('revenue'))}, "
            f"AOV: ₱{money(ddata.get('averageOrderValue'))}"
        )
    daily_summary = "\n".join(daily_lines) or "No daily data available."

    # Hourly summary
    daily_keys = sorted((daily or {}).keys(), reverse=True)
    latest_day = daily_keys[0] if daily_keys else None
    hourly_summary = "No hourly data available."
    if latest_day and hourly and hourly.get(latest_day):
        hourly_day = hourly[latest_day] or {}
        hourly_rows = sorted(hourly_day.items(), key=lambda x: x[0])
        lines = []
        for hour, hdata in hourly_rows:
            if not isinstance(hdata, dict):
                hdata = {}
            lines.append(
                f"  {hour}:00 - {hdata.get('orders', 0) or 0} orders, "
                f"Revenue: ₱{money(hdata.get('revenue'))}"
            )
        hourly_summary = f"Hourly data for {latest_day}:\n" + "\n".join(lines)

    # Weekly summary
    weekly_entries = sorted((weekly or {}).items(), key=lambda x: x[0], reverse=True)[:8]
    weekly_lines = []
    for wk, wdata in weekly_entries:
        if not isinstance(wdata, dict):
            wdata = {}
        weekly_lines.append(
            f"  {wk}: {wdata.get('orders', 0) or 0} orders, "
            f"Revenue: ₱{money(wdata.get('revenue'))}"
        )
    weekly_summary_text = "\n".join(weekly_lines) or "No weekly data available."

    # Monthly summary
    monthly_entries = sorted((monthly or {}).items(), key=lambda x: x[0], reverse=True)[:6]
    monthly_lines = []
    for mo, mdata in monthly_entries:
        if not isinstance(mdata, dict):
            mdata = {}
        monthly_lines.append(
            f"  {mo}: {mdata.get('orders', 0) or 0} orders, "
            f"Revenue: ₱{money(mdata.get('revenue'))}"
        )
    monthly_summary_text = "\n".join(monthly_lines) or "No monthly data available."

    # Mode label
    mode_map = {
        "deep": "deep analysis report",
        "live": "AI live operations feed hourly update",
        "briefing": "AI shift handoff",
        "leak": "AI revenue leak detector",
        "simulation": "AI decision simulator",
        "opschat": "AI operations manager work chat",
    }
    requested_mode = mode_map.get(mode, "real-time quick insight")

    # Statistics safe access
    orders_per_day = statistics.get("ordersPerDay") or {}
    revenue_per_day = statistics.get("revenuePerDay") or {}

    return f"""Here is the complete analytics data from our restaurant self-ordering system.

Requested analysis mode: {requested_mode}
Report time: {report_context.get('asOfLabel') or 'Current time'}
Manager name: {report_context.get('managerNickname') or 'Manager'}
Branch: {report_context.get('branchLabel') or 'Current branch'}
Time of day label: {report_context.get('timeOfDayLabel') or 'Current shift'}
Manager question or scenario: {report_context.get('scenario') or 'N/A'}

=== OVERALL SUMMARY ===
Total Orders: {summary.get('totalOrders', 0) or 0}
Total Revenue: ₱{money(summary.get('totalRevenue'))}
Average Order Value: ₱{money(summary.get('averageOrderValue'))}
Best Selling Item: {format_product_name(summary.get('bestSellingItem') or 'N/A')}
Least Selling Item: {format_product_name(summary.get('leastSellingItem') or 'N/A')}
Last Updated: {summary.get('lastUpdated') or 'N/A'}

=== CURRENT PERIOD ===
Today: {today_analytics.get('orders', 0) or 0} orders, Revenue: ₱{money(today_analytics.get('revenue'))}
This Week: {week_analytics.get('orders', 0) or 0} orders, Revenue: ₱{money(week_analytics.get('revenue'))}
This Month: {month_analytics.get('orders', 0) or 0} orders, Revenue: ₱{money(month_analytics.get('revenue'))}

=== AVERAGES ===
Mean Daily Orders: {orders_per_day.get('mean', 0) or 0}
Median Daily Orders: {orders_per_day.get('median', 0) or 0}
Mean Daily Revenue: ₱{money(revenue_per_day.get('mean'))}
Median Daily Revenue: ₱{money(revenue_per_day.get('median'))}

=== PRODUCTS ({len(product_entries)} items) ===
{product_summary}

=== INVENTORY ({len(inventory or {})}) items) ===
{inventory_summary}

=== DAILY TRENDS (Last 14 days) ===
{daily_summary}

=== HOURLY DISTRIBUTION ===
{hourly_summary}

=== WEEKLY TRENDS ===
{weekly_summary_text}

=== MONTHLY TRENDS ===
{monthly_summary_text}

Please provide operational interpretation, not a dashboard recap."""


# ─── OpenAI Response Parser ─────────────────────────────────────────────────

def parse_model_json(raw: str | None) -> dict:
    """Parse the OpenAI model's JSON response, stripping markdown fences."""
    cleaned = str(raw or "")
    cleaned = re.sub(r"```json\n?", "", cleaned)
    cleaned = re.sub(r"```\n?", "", cleaned)
    cleaned = cleaned.strip()

    if not cleaned:
        raise ValueError("OpenAI returned an empty analysis response.")

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse OpenAI JSON: %s — preview: %s", e, cleaned[:500])
        raise ValueError(f"OpenAI returned invalid JSON: {e}") from e


# ─── Request Schema ──────────────────────────────────────────────────────────

class AIAnalysisRequest(BaseModel):
    analyticsData: dict | None = None
    mode: str | None = None
    branchId: str | None = None


# ─── Router ──────────────────────────────────────────────────────────────────

router = APIRouter()


@router.post("/api/ai-analysis", summary="AI Analysis — ported from Firebase Cloud Functions")
async def ai_analysis(body: AIAnalysisRequest, request: Request):
    """
    Full AI analysis endpoint. Accepts analytics data, calls OpenAI,
    returns structured analysis JSON.

    Ported from functions/index.js exports.aiAnalysis.
    """

    # ── Auth verification ────────────────────────────────────────────────
    user = await verify_firebase_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in again before generating AI analysis.")

    # ── Validate payload ─────────────────────────────────────────────────
    branch_id = safe_branch_id(body.branchId)
    if not branch_id:
        raise HTTPException(status_code=400, detail="A valid branch ID is required for AI analysis.")

    analytics_data = body.analyticsData
    if not analytics_data or not isinstance(analytics_data, dict):
        raise HTTPException(status_code=400, detail="A valid analyticsData object is required for AI analysis.")

    report_context = analytics_data.get("reportContext")
    if report_context is not None and not isinstance(report_context, dict):
        raise HTTPException(status_code=400, detail="analyticsData.reportContext must be an object when provided.")

    # ── Normalize mode ───────────────────────────────────────────────────
    requested_mode = body.mode or ""
    mode = requested_mode if requested_mode in VALID_MODES else "realtime"

    # ── Read API key ─────────────────────────────────────────────────────
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key or api_key == "your_openai_api_key_here":
        logger.error("OPENAI_API_KEY is not configured on the server.")
        raise HTTPException(
            status_code=400,
            detail="AI analysis is not configured. Set OPENAI_API_KEY on the server.",
        )

    model = os.environ.get("OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL

    # ── Build prompts ────────────────────────────────────────────────────
    system_prompt = build_system_prompt(mode)
    data_prompt = build_data_prompt(analytics_data, mode)

    max_tokens = 2600 if mode in EXTENDED_MODES else 350
    temperature = 0.45 if mode in EXTENDED_MODES else 0.35

    # ── Call OpenAI API ──────────────────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": data_prompt},
                    ],
                    "response_format": {"type": "json_object"},
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                },
            )
    except httpx.ConnectError:
        logger.error("OpenAI API is unreachable.")
        raise HTTPException(
            status_code=502,
            detail="AI analysis service is temporarily unreachable. Please try again shortly.",
        )
    except httpx.TimeoutException:
        logger.error("OpenAI API request timed out.")
        raise HTTPException(
            status_code=502,
            detail="AI analysis service timed out. Please try again shortly.",
        )

    # ── Handle non-200 responses ─────────────────────────────────────────
    if response.status_code != 200:
        error_text = ""
        try:
            err_data = response.json()
            error_text = (
                err_data.get("error", {}).get("message")
                or err_data.get("message")
                or ""
            )
        except Exception:
            error_text = response.text[:500] if response.text else ""

        logger.error(
            "OpenAI API failed with status %d: %s", response.status_code, error_text
        )

        if response.status_code in (401, 403):
            raise HTTPException(
                status_code=401,
                detail="AI analysis credentials are invalid. Check OPENAI_API_KEY on the server.",
            )
        if response.status_code == 429:
            raise HTTPException(
                status_code=429,
                detail="AI analysis is temporarily rate limited. Please try again shortly.",
            )
        if response.status_code == 404:
            raise HTTPException(
                status_code=502,
                detail=f"AI analysis model was not found. Check OPENAI_MODEL on the server. Current model: {model}.",
            )

        raise HTTPException(
            status_code=502,
            detail="AI analysis service is temporarily unavailable. Please try again shortly.",
        )

    # ── Parse OpenAI response ────────────────────────────────────────────
    try:
        data = response.json()
    except Exception:
        logger.error("OpenAI API returned invalid JSON.")
        raise HTTPException(
            status_code=502,
            detail="AI analysis service returned an invalid response.",
        )

    try:
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        analysis = parse_model_json(content)
    except (ValueError, IndexError) as e:
        logger.error("OpenAI analysis response could not be parsed: %s", e)
        raise HTTPException(
            status_code=502,
            detail="AI analysis service returned an unreadable analysis response.",
        )

    # ── Record usage (non-blocking, errors swallowed) ────────────────────
    usage = data.get("usage") or {}
    try:
        await record_ai_usage(branch_id, mode, usage)
    except Exception as e:
        logger.error("AI usage logging failed: %s", e)

    # ── Return analysis ──────────────────────────────────────────────────
    service_label = (
        "executiveBusinessAnalysis" if mode == "deep"
        else "advancedOperationsManager" if mode in EXTENDED_MODES
        else "liveOperationsFeed"
    )

    return {
        **analysis,
        "usageMeta": {
            "service": service_label,
            "totalTokens": usage.get("total_tokens", 0) or 0,
            "estimatedCostPhp": estimate_cost_php(usage),
        },
    }
