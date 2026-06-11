/**
 * AI Restaurant Operations Analyst Service
 * 
 * Sends pre-calculated analytics data to OpenAI GPT-4o-mini
 * and returns structured business insights.
 * 
 * The AI does NOT collect data or calculate analytics.
 * It only analyzes the provided data, identifies patterns,
 * and generates actionable recommendations.
 */

import { formatProductName } from './formatProductName';

const OPENAI_API_KEY = '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';

const CACHE_KEY_PREFIX = 'ai_analyst_cache_';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Build the system prompt for the AI analyst
 */
function buildSystemPrompt() {
  return `You are an AI Restaurant Operations Analyst integrated into a self-ordering system for cafes and restaurants.

You do NOT collect raw order data.
You do NOT calculate analytics.
A separate analytics engine already provides all statistical information.
Your job is to analyze the provided analytics data, identify patterns, discover opportunities, detect problems, generate conclusions, and recommend actionable business improvements.

Think like a combination of:
- Restaurant Operations Manager
- Business Analyst
- Data Analyst
- Revenue Analyst
- Inventory Planner
- Customer Behavior Analyst

Your goal is to help restaurant owners make better decisions.

IMPORTANT RULES:
- Do NOT invent data.
- Do NOT make assumptions unsupported by the analytics.
- Every conclusion must reference specific analytics metrics.
- If data is insufficient, explicitly state: "Insufficient data available to draw a reliable conclusion."
- Prioritize actionable recommendations over generic advice.
- Do NOT use any emoji characters anywhere in your response.
- Product names should be in proper human-readable format (no underscores).
- Act like a restaurant consultant being paid to improve profitability, efficiency, customer experience, and operational decision-making.

Return your analysis as valid JSON with this exact structure:
{
  "executiveSummary": "string — concise summary of business performance, revenue health, order volume, product performance, operational observations",
  "keyStrengths": ["string array — positive findings: high-performing products, revenue growth, consistent demand, popular periods, strong patterns"],
  "opportunities": ["string array — revenue improvement ideas: upselling, bundles, combos, promotional timing, menu optimization"],
  "risksAndConcerns": ["string array — weaknesses: slow-moving products, declining sales, revenue drops, underutilized hours, product cannibalization"],
  "productAnalysis": "string — detailed analysis of product performance, growth/decline trends, best/worst sellers, product strategy recommendations",
  "revenueAnalysis": "string — revenue health, growth direction, average order value analysis, revenue distribution insights",
  "customerBehaviorAnalysis": "string — ordering patterns, peak hours behavior, frequency analysis, customer preferences",
  "inventoryRecommendations": ["string array — specific inventory adjustments with percentage estimates where possible"],
  "staffingRecommendations": ["string array — staffing adjustments based on hourly demand patterns"],
  "priorityActions": {
    "high": ["string array — actions requiring immediate attention"],
    "medium": ["string array — actions likely to improve revenue"],
    "low": ["string array — long-term optimizations"]
  },
  "finalConclusion": "string — overall business conclusion and outlook"
}

Return ONLY valid JSON. No markdown, no code fences, no extra text.`;
}

/**
 * Format analytics data into a structured prompt for the AI
 */
function buildDataPrompt(analyticsData) {
  const {
    summary = {},
    products = {},
    daily = {},
    hourly = {},
    weekly = {},
    monthly = {},
    statistics = {},
    todayAnalytics = {},
    weekAnalytics = {},
    monthAnalytics = {},
  } = analyticsData;

  // Format product data with readable names
  const productEntries = Object.entries(products);
  const productSummary = productEntries
    .sort(([, a], [, b]) => (b.quantitySold || 0) - (a.quantitySold || 0))
    .map(([id, data], i) => {
      const name = formatProductName(data.name || id);
      const avgPrice = data.orderCount > 0 ? (data.revenue / data.orderCount).toFixed(2) : '0.00';
      return `  ${i + 1}. ${name}: ${data.quantitySold || 0} units sold, ${data.orderCount || 0} orders, Revenue: ${data.revenue?.toFixed(2) || '0.00'}, Avg Price: ${avgPrice}`;
    })
    .join('\n');

  // Format daily data (last 14 days)
  const dailyEntries = Object.entries(daily)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 14);
  const dailySummary = dailyEntries
    .map(([date, data]) => `  ${date}: ${data.orders || 0} orders, Revenue: ${data.revenue?.toFixed(2) || '0.00'}, AOV: ${data.averageOrderValue?.toFixed(2) || '0.00'}`)
    .join('\n');

  // Format hourly data for the most recent day
  const sortedDailyKeys = Object.keys(daily).sort((a, b) => b.localeCompare(a));
  const latestDay = sortedDailyKeys[0];
  let hourlySummary = 'No hourly data available.';
  if (latestDay && hourly[latestDay]) {
    hourlySummary = Object.entries(hourly[latestDay])
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, data]) => `  ${hour}:00 — ${data.orders || 0} orders, Revenue: ${data.revenue?.toFixed(2) || '0.00'}`)
      .join('\n');
    hourlySummary = `Hourly data for ${latestDay}:\n${hourlySummary}`;
  }

  // Format weekly data
  const weeklySummary = Object.entries(weekly)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 8)
    .map(([week, data]) => `  ${week}: ${data.orders || 0} orders, Revenue: ${data.revenue?.toFixed(2) || '0.00'}`)
    .join('\n');

  // Format monthly data
  const monthlySummary = Object.entries(monthly)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 6)
    .map(([month, data]) => `  ${month}: ${data.orders || 0} orders, Revenue: ${data.revenue?.toFixed(2) || '0.00'}`)
    .join('\n');

  return `Here is the complete analytics data from our restaurant self-ordering system. Analyze this data and provide your insights.

=== OVERALL SUMMARY ===
Total Orders: ${summary.totalOrders || 0}
Total Revenue: ${summary.totalRevenue?.toFixed(2) || '0.00'}
Average Order Value: ${summary.averageOrderValue?.toFixed(2) || '0.00'}
Best Selling Item: ${formatProductName(summary.bestSellingItem || 'N/A')}
Least Selling Item: ${formatProductName(summary.leastSellingItem || 'N/A')}
Last Updated: ${summary.lastUpdated || 'N/A'}

=== CURRENT PERIOD METRICS ===
Today: ${todayAnalytics.orders || 0} orders, Revenue: ${todayAnalytics.revenue?.toFixed(2) || '0.00'}
This Week: ${weekAnalytics.orders || 0} orders, Revenue: ${weekAnalytics.revenue?.toFixed(2) || '0.00'}
This Month: ${monthAnalytics.orders || 0} orders, Revenue: ${monthAnalytics.revenue?.toFixed(2) || '0.00'}

=== STATISTICAL SUMMARY ===
Mean Daily Orders: ${statistics.ordersPerDay?.mean || 0}
Median Daily Orders: ${statistics.ordersPerDay?.median || 0}
Mode Daily Orders: ${statistics.ordersPerDay?.mode || 0}
Mean Daily Revenue: ${statistics.revenuePerDay?.mean || 0}
Median Daily Revenue: ${statistics.revenuePerDay?.median || 0}

=== PRODUCT PERFORMANCE (${productEntries.length} products) ===
${productSummary || 'No product data available.'}

=== DAILY TRENDS (Last 14 days) ===
${dailySummary || 'No daily data available.'}

=== HOURLY DISTRIBUTION ===
${hourlySummary}

=== WEEKLY TRENDS ===
${weeklySummary || 'No weekly data available.'}

=== MONTHLY TRENDS ===
${monthlySummary || 'No monthly data available.'}

Please analyze this data thoroughly and return your structured JSON analysis.`;
}

/**
 * Call the OpenAI API with the analytics data
 */
async function callOpenAI(systemPrompt, dataPrompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: dataPrompt },
      ],
      max_tokens: 3000,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorData}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || '';

  // Clean and parse JSON
  const cleaned = raw
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (parseError) {
    console.error('[AI Analyst] Failed to parse response:', cleaned);
    throw new Error('Failed to parse AI response as JSON');
  }
}

/**
 * Get cached analysis for a branch
 */
function getCachedAnalysis(branchId) {
  try {
    const key = CACHE_KEY_PREFIX + branchId;
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const parsed = JSON.parse(cached);
    const age = Date.now() - (parsed.timestamp || 0);

    if (age > CACHE_DURATION_MS) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed.analysis;
  } catch {
    return null;
  }
}

/**
 * Cache analysis for a branch
 */
function cacheAnalysis(branchId, analysis) {
  try {
    const key = CACHE_KEY_PREFIX + branchId;
    localStorage.setItem(key, JSON.stringify({
      timestamp: Date.now(),
      analysis,
    }));
  } catch {
    // localStorage might be full or unavailable
  }
}

/**
 * Generate AI analysis from analytics data
 * Returns a structured analysis object
 * 
 * @param {Object} analyticsData - All analytics data from Firebase
 * @param {string} branchId - Branch identifier for caching
 * @param {boolean} forceRefresh - Skip cache and regenerate
 * @returns {Promise<Object>} Structured analysis
 */
export async function generateAIAnalysis(analyticsData, branchId, forceRefresh = false) {
  // Check cache first
  if (!forceRefresh && branchId) {
    const cached = getCachedAnalysis(branchId);
    if (cached) {
      return { ...cached, fromCache: true };
    }
  }

  const systemPrompt = buildSystemPrompt();
  const dataPrompt = buildDataPrompt(analyticsData);

  const analysis = await callOpenAI(systemPrompt, dataPrompt);

  // Validate required fields
  const defaultAnalysis = {
    executiveSummary: '',
    keyStrengths: [],
    opportunities: [],
    risksAndConcerns: [],
    productAnalysis: '',
    revenueAnalysis: '',
    customerBehaviorAnalysis: '',
    inventoryRecommendations: [],
    staffingRecommendations: [],
    priorityActions: { high: [], medium: [], low: [] },
    finalConclusion: '',
    generatedAt: new Date().toISOString(),
    fromCache: false,
  };

  const result = { ...defaultAnalysis, ...analysis, generatedAt: new Date().toISOString(), fromCache: false };

  // Ensure priorityActions has correct structure
  if (!result.priorityActions || typeof result.priorityActions !== 'object') {
    result.priorityActions = { high: [], medium: [], low: [] };
  }
  result.priorityActions.high = result.priorityActions.high || [];
  result.priorityActions.medium = result.priorityActions.medium || [];
  result.priorityActions.low = result.priorityActions.low || [];

  // Cache the result
  if (branchId) {
    cacheAnalysis(branchId, result);
  }

  return result;
}

/**
 * Clear cached analysis for a branch
 */
export function clearAnalysisCache(branchId) {
  try {
    localStorage.removeItem(CACHE_KEY_PREFIX + branchId);
  } catch {
    // ignore
  }
}
