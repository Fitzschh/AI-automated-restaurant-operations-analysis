const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { getDatabase, ServerValue } = require('firebase-admin/database');

admin.initializeApp();

const openAiApiKey = defineSecret('OPENAI_API_KEY');
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const PHP_PER_USD = 58;
const GPT_4O_MINI_INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const GPT_4O_MINI_OUTPUT_USD_PER_TOKEN = 0.60 / 1_000_000;

function stripEmoji(value) {
  return String(value || '').replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F]/gu, '').trim();
}

function formatProductName(raw) {
  return stripEmoji(raw)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function safeBranchId(value) {
  const branchId = String(value || '').trim();
  return /^[a-zA-Z0-9_-]+$/.test(branchId) ? branchId : null;
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatMonthKey(date) {
  return date.toISOString().slice(0, 7);
}

function formatWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function estimateCostPhp(usage = {}) {
  const promptTokens = Number(usage.prompt_tokens || 0);
  const completionTokens = Number(usage.completion_tokens || 0);
  const usd = (promptTokens * GPT_4O_MINI_INPUT_USD_PER_TOKEN)
    + (completionTokens * GPT_4O_MINI_OUTPUT_USD_PER_TOKEN);
  return Number((usd * PHP_PER_USD).toFixed(6));
}

async function recordAiUsage({ branchId, mode, usage }) {
  if (!branchId || !usage) return;

  const now = new Date();
  const service = mode === 'deep'
    ? 'executiveBusinessAnalysis'
    : ['briefing', 'leak', 'simulation', 'opschat'].includes(mode)
      ? 'advancedOperationsManager'
      : 'liveOperationsFeed';
  const trigger = mode === 'live' ? 'hourly' : mode;
  const costPhp = estimateCostPhp(usage);
  const metrics = {
    requests: ServerValue.increment(1),
    promptTokens: ServerValue.increment(Number(usage.prompt_tokens || 0)),
    completionTokens: ServerValue.increment(Number(usage.completion_tokens || 0)),
    totalTokens: ServerValue.increment(Number(usage.total_tokens || 0)),
    estimatedCostPhp: ServerValue.increment(costPhp),
    lastUpdated: now.toISOString(),
  };

  const period = formatMonthKey(now);
  const dateKey = formatDateKey(now);
  const weekKey = formatWeekKey(now);
  const updates = {};
  const paths = [
    `${branchId}/aiUsage/${period}/services/${service}`,
    `${branchId}/aiUsage/${period}/triggers/${trigger}/${service}`,
    `${branchId}/aiUsage/${period}/daily/${dateKey}/${service}`,
    `${branchId}/aiUsage/${period}/weekly/${weekKey}/${service}`,
    `${branchId}/aiUsage/${period}/monthly/${period}/${service}`,
  ];

  for (const path of paths) {
    for (const [key, value] of Object.entries(metrics)) {
      updates[`${path}/${key}`] = value;
    }
  }

  await getDatabase().ref().update(updates);
}

function buildSystemPrompt(mode) {
  const schema = mode === 'briefing'
    ? `{
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
}`
    : mode === 'leak'
      ? `{
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
}`
      : mode === 'simulation'
        ? `{
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
}`
        : mode === 'opschat'
          ? `{
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
}`
        : mode === 'deep'
    ? `{
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
}`
    : `{
  "mode": "${mode === 'live' ? 'live' : 'realtime'}",
  "insight": {
    "message": "${mode === 'live' ? 'Start with As of {time}: then give one operational update. Maximum 45 words total.' : 'One natural manager-facing note. Maximum 2 short sentences and 35 words total.'}",
    "action": "One clear next action. Maximum 12 words.",
    "priority": "HIGH, MEDIUM, or LOW"
  }
}`;

  return `You are the AI Restaurant Analyst for E-Menu Portal.

Your responsibility is to analyze restaurant operations, sales performance, inventory levels, customer ordering trends, and business metrics, then provide actionable recommendations to restaurant managers and owners.

Do not simply repeat dashboard statistics. Interpret the data, identify opportunities, predict issues, and recommend actions like an experienced restaurant operations consultant.

Use plain language. Be direct, practical, and professional. Do not use emoji characters. Use Philippine peso formatting for currency, for example ₱42,500. Do not invent exact comparisons when the source data does not support them; say when a comparison is unavailable.
Treat the CURRENT INVENTORY section as the active menu/inventory list. Do not recommend restocking, restoring, preparing, promoting, or taking operational action on products that are absent from current inventory.

Mode: ${
    mode === 'deep'
      ? 'DEEP ANALYSIS REPORT'
      : mode === 'live'
        ? 'AI LIVE OPERATIONS FEED HOURLY UPDATE'
        : mode === 'briefing'
          ? 'AI SHIFT HANDOFF'
          : mode === 'leak'
            ? 'AI REVENUE LEAK DETECTOR'
            : mode === 'simulation'
              ? 'AI DECISION SIMULATOR'
              : mode === 'opschat'
                ? 'AI OPERATIONS MANAGER WORK CHAT'
                : 'REAL-TIME AI ANALYST'
  }

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
${schema}`;
}

function buildDataPrompt(analyticsData, mode) {
  const data = analyticsData || {};
  const {
    reportContext = {},
    summary = {},
    products = {},
    inventory = {},
    daily = {},
    hourly = {},
    weekly = {},
    monthly = {},
    statistics = {},
    todayAnalytics = {},
    weekAnalytics = {},
    monthAnalytics = {},
  } = data;

  const productEntries = Object.entries(products || {});
  const productSummary = productEntries
    .sort(([, a], [, b]) => (b?.quantitySold || 0) - (a?.quantitySold || 0))
    .map(([id, itemData], i) => {
      const name = formatProductName(itemData?.name || id);
      const avgPrice = itemData?.orderCount > 0 ? money(Number(itemData?.revenue || 0) / itemData.orderCount) : '0.00';
      return `  ${i + 1}. ${name}: ${itemData?.quantitySold || 0} units sold, ${itemData?.orderCount || 0} orders, Revenue: ₱${money(itemData?.revenue)}, Avg Price: ₱${avgPrice}`;
    })
    .join('\n');

  const inventorySummary = Object.entries(inventory || {})
    .sort(([, a], [, b]) => {
      const stockA = Number(a?.stock ?? a?.currentStock ?? 0);
      const stockB = Number(b?.stock ?? b?.currentStock ?? 0);
      return stockA - stockB;
    })
    .slice(0, 30)
    .map(([id, itemData]) => {
      const product = (products || {})[id] || {};
      const stock = Number(itemData?.stock ?? itemData?.currentStock ?? 0);
      const warningLevel = Number(itemData?.warningLevel ?? 10);
      const criticalLevel = Number(itemData?.criticalLevel ?? 5);
      const quantitySold = Number(product?.quantitySold || 0);
      const orderCount = Number(product?.orderCount || 0);
      return `  ${formatProductName(itemData?.productName || itemData?.name || product?.name || id)}: stock ${stock} ${itemData?.unit || 'units'}, warning at ${warningLevel}, critical at ${criticalLevel}, sold ${quantitySold} units across ${orderCount} orders`;
    })
    .join('\n');

  const dailySummary = Object.entries(daily || {})
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 14)
    .map(([date, itemData]) => `  ${date}: ${itemData?.orders || 0} orders, Revenue: ₱${money(itemData?.revenue)}, AOV: ₱${money(itemData?.averageOrderValue)}`)
    .join('\n');

  const latestDay = Object.keys(daily || {}).sort((a, b) => b.localeCompare(a))[0];
  let hourlySummary = 'No hourly data available.';
  if (latestDay && hourly && hourly[latestDay]) {
    const hourlyRows = Object.entries(hourly[latestDay] || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, itemData]) => `  ${hour}:00 - ${itemData?.orders || 0} orders, Revenue: ₱${money(itemData?.revenue)}`)
      .join('\n');
    hourlySummary = `Hourly data for ${latestDay}:\n${hourlyRows}`;
  }

  const weeklySummary = Object.entries(weekly || {})
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 8)
    .map(([week, itemData]) => `  ${week}: ${itemData?.orders || 0} orders, Revenue: ₱${money(itemData?.revenue)}`)
    .join('\n');

  const monthlySummary = Object.entries(monthly || {})
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 6)
    .map(([month, itemData]) => `  ${month}: ${itemData?.orders || 0} orders, Revenue: ₱${money(itemData?.revenue)}`)
    .join('\n');

  const requestedMode = mode === 'deep'
    ? 'deep analysis report'
    : mode === 'live'
      ? 'AI live operations feed hourly update'
      : mode === 'briefing'
        ? 'AI shift handoff'
        : mode === 'leak'
          ? 'AI revenue leak detector'
          : mode === 'simulation'
            ? 'AI decision simulator'
            : mode === 'opschat'
              ? 'AI operations manager work chat'
              : 'real-time quick insight';

  return `Here is the complete analytics data from our restaurant self-ordering system.

Requested analysis mode: ${requestedMode}
Report time: ${reportContext?.asOfLabel || 'Current time'}
Manager name: ${reportContext?.managerNickname || 'Manager'}
Branch: ${reportContext?.branchLabel || 'Current branch'}
Time of day label: ${reportContext?.timeOfDayLabel || 'Current shift'}
Manager question or scenario: ${reportContext?.scenario || 'N/A'}

=== OVERALL SUMMARY ===
Total Orders: ${summary?.totalOrders || 0}
Total Revenue: ₱${money(summary?.totalRevenue)}
Average Order Value: ₱${money(summary?.averageOrderValue)}
Best Selling Item: ${formatProductName(summary?.bestSellingItem || 'N/A')}
Least Selling Item: ${formatProductName(summary?.leastSellingItem || 'N/A')}
Last Updated: ${summary?.lastUpdated || 'N/A'}

=== CURRENT PERIOD ===
Today: ${todayAnalytics?.orders || 0} orders, Revenue: ₱${money(todayAnalytics?.revenue)}
This Week: ${weekAnalytics?.orders || 0} orders, Revenue: ₱${money(weekAnalytics?.revenue)}
This Month: ${monthAnalytics?.orders || 0} orders, Revenue: ₱${money(monthAnalytics?.revenue)}

=== AVERAGES ===
Mean Daily Orders: ${statistics?.ordersPerDay?.mean || 0}
Median Daily Orders: ${statistics?.ordersPerDay?.median || 0}
Mean Daily Revenue: ₱${money(statistics?.revenuePerDay?.mean)}
Median Daily Revenue: ₱${money(statistics?.revenuePerDay?.median)}

=== PRODUCTS (${productEntries.length} items) ===
${productSummary || 'No product data available.'}

=== INVENTORY (${Object.keys(inventory || {}).length} items) ===
${inventorySummary || 'No inventory data available.'}

=== DAILY TRENDS (Last 14 days) ===
${dailySummary || 'No daily data available.'}

=== HOURLY DISTRIBUTION ===
${hourlySummary}

=== WEEKLY TRENDS ===
${weeklySummary || 'No weekly data available.'}

=== MONTHLY TRENDS ===
${monthlySummary || 'No monthly data available.'}

Please provide operational interpretation, not a dashboard recap.`;
}

function parseModelJson(raw) {
  const cleaned = String(raw || '')
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  if (!cleaned) {
    const error = new Error('OpenAI returned an empty analysis response.');
    error.code = 'EMPTY_MODEL_RESPONSE';
    throw error;
  }

  try {
    return JSON.parse(cleaned);
  } catch (parseError) {
    parseError.code = 'MODEL_JSON_PARSE_FAILED';
    parseError.preview = cleaned.slice(0, 500);
    throw parseError;
  }
}

async function verifyFirebaseUser(req) {
  const authHeader = req.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return null;
  return admin.auth().verifyIdToken(match[1]);
}

function readOpenAiApiKey() {
  let secretValue = '';
  try {
    secretValue = openAiApiKey.value();
  } catch (error) {
    secretValue = '';
  }

  const apiKey = String(secretValue || process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    return null;
  }

  return apiKey;
}

function readOpenAiModel() {
  return String(process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim() || DEFAULT_OPENAI_MODEL;
}

function validateAnalysisPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object.';
  }

  if (!safeBranchId(body.branchId)) {
    return 'A valid branch ID is required for AI analysis.';
  }

  if (!body.analyticsData || typeof body.analyticsData !== 'object' || Array.isArray(body.analyticsData)) {
    return 'A valid analyticsData object is required for AI analysis.';
  }

  const reportContext = body.analyticsData.reportContext;
  if (reportContext !== undefined && (typeof reportContext !== 'object' || Array.isArray(reportContext))) {
    return 'analyticsData.reportContext must be an object when provided.';
  }

  return null;
}

async function readOpenAiError(response) {
  const status = response.status;
  const fallback = `OpenAI request failed with status ${status}.`;

  try {
    const text = await response.text();
    if (!text) return fallback;

    try {
      const parsed = JSON.parse(text);
      return parsed?.error?.message || parsed?.message || fallback;
    } catch {
      return text.slice(0, 500);
    }
  } catch {
    return fallback;
  }
}

exports.aiAnalysis = onRequest({ cors: true, secrets: [openAiApiKey] }, async (req, res) => {
  if (req.method !== 'POST') {
    res.set('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const user = await verifyFirebaseUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in again before generating AI analysis.' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Sign in again before generating AI analysis.' });
    return;
  }

  const payloadError = validateAnalysisPayload(req.body);
  if (payloadError) {
    res.status(400).json({ error: payloadError });
    return;
  }

  const requestedMode = req.body?.mode;
  const mode = ['deep', 'live', 'briefing', 'leak', 'simulation', 'opschat'].includes(requestedMode)
    ? requestedMode
    : 'realtime';
  const branchId = safeBranchId(req.body?.branchId);

  const apiKey = readOpenAiApiKey();
  const model = readOpenAiModel();
  if (!apiKey) {
    console.error('OPENAI_API_KEY is not configured on the server.');
    res.status(400).json({ error: 'AI analysis is not configured. Set OPENAI_API_KEY on the server.' });
    return;
  }

  try {
    let response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: buildSystemPrompt(mode) },
            { role: 'user', content: buildDataPrompt(req.body.analyticsData, mode) },
          ],
          response_format: { type: 'json_object' },
          max_tokens: ['deep', 'briefing', 'leak', 'simulation', 'opschat'].includes(mode) ? 2600 : 350,
          temperature: ['deep', 'briefing', 'leak', 'simulation', 'opschat'].includes(mode) ? 0.45 : 0.35,
        }),
      });
    } catch (networkError) {
      console.error('OpenAI API request could not be reached:', networkError.message);
      res.status(502).json({ error: 'AI analysis service is temporarily unreachable. Please try again shortly.' });
      return;
    }

    if (!response.ok) {
      const upstreamMessage = await readOpenAiError(response);
      console.error(`OpenAI API request failed with status ${response.status}: ${upstreamMessage}`);

      if (response.status === 401 || response.status === 403) {
        res.status(401).json({ error: 'AI analysis credentials are invalid. Check OPENAI_API_KEY on the server.' });
        return;
      }

      if (response.status === 429) {
        res.status(429).json({ error: 'AI analysis is temporarily rate limited. Please try again shortly.' });
        return;
      }

      if (response.status === 404) {
        res.status(502).json({ error: `AI analysis model was not found. Check OPENAI_MODEL on the server. Current model: ${model}.` });
        return;
      }

      res.status(502).json({ error: 'AI analysis service is temporarily unavailable. Please try again shortly.' });
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error('OpenAI API returned invalid JSON:', jsonError.message);
      res.status(502).json({ error: 'AI analysis service returned an invalid response.' });
      return;
    }

    let analysis;
    try {
      analysis = parseModelJson(data.choices?.[0]?.message?.content);
    } catch (parseError) {
      console.error('OpenAI analysis response could not be parsed:', parseError.message, parseError.preview || '');
      res.status(502).json({ error: 'AI analysis service returned an unreadable analysis response.' });
      return;
    }

    try {
      await recordAiUsage({ branchId, mode, usage: data.usage });
    } catch (usageError) {
      console.error('AI usage logging failed:', usageError.message);
    }

    res.status(200).json({
      ...analysis,
      usageMeta: {
        service: mode === 'deep'
          ? 'executiveBusinessAnalysis'
          : ['briefing', 'leak', 'simulation', 'opschat'].includes(mode)
            ? 'advancedOperationsManager'
            : 'liveOperationsFeed',
        totalTokens: data.usage?.total_tokens || 0,
        estimatedCostPhp: estimateCostPhp(data.usage),
      },
    });
  } catch (error) {
    console.error('AI analysis request failed:', error.message);
    res.status(500).json({ error: 'AI analysis failed on the server.' });
  }
});
