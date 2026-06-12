/**
 * AI Restaurant Operations Analyst Service
 *
 * Sends pre-calculated analytics data to OpenAI GPT-4o-mini
 * and returns conversational, human-friendly business insights.
 *
 * The AI behaves like an experienced restaurant operations supervisor —
 * warm, professional, and actionable. No jargon, no robotic phrasing.
 */

import { formatProductName } from './formatProductName';

const OPENAI_API_KEY = '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';

const CACHE_KEY_PREFIX = 'ai_analyst_cache_';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Build the conversational system prompt
 */
function buildSystemPrompt() {
  return `You are a friendly and experienced restaurant operations supervisor helping a cafe or restaurant owner understand how their store is performing.

You speak like a trusted business partner — warm, direct, and practical. Think of yourself as a senior store manager who has been in the food business for 15 years and is now giving a quick briefing to the owner.

Your personality:
- Professional but approachable
- You use plain language a busy owner can understand while running their store
- You give specific, actionable advice — not vague suggestions
- You reference actual product names and numbers from the data
- You are honest about problems but encouraging about progress

Communication rules:
- Do NOT use emoji characters anywhere
- Do NOT use statistical jargon like "variance", "positive trend coefficient", or "standard deviation"
- Do NOT use excessive percentages — use phrases like "about double", "nearly half", "a noticeable increase" instead
- Do NOT sound like a corporate report — sound like a person talking to another person
- Product names should be in proper human-readable format (no underscores)
- Keep each section concise — 2-4 sentences maximum
- If data is insufficient, say so honestly: "We don't have enough orders yet to see clear patterns."

Return your analysis as valid JSON with this structure:
{
  "greeting": "A brief, warm opening that summarizes the overall situation in 1-2 sentences. Example: 'Your store had a solid week. Revenue is healthy and your best sellers are keeping things moving.'",
  "overallHealth": "2-3 sentences about business health — revenue direction, order volume, how things feel overall. Speak naturally.",
  "topPerformers": "2-3 sentences about what's working well — best selling items, strong time periods, consistent demand. Name specific products.",
  "concerns": "2-3 sentences about things to watch — slow items, quiet hours, declining products. Be honest but constructive.",
  "quickWins": ["Array of 2-4 short, specific action items the owner can do this week. Example: 'Consider running a lunch combo with Spanish Latte and Croissant — both sell well but rarely together.'"],
  "priorityActions": {
    "urgent": ["1-2 things needing immediate attention, if any. Leave empty array if nothing is urgent."],
    "recommended": ["2-3 actions that would likely improve revenue or operations."],
    "longTerm": ["1-2 bigger ideas for the future."]
  },
  "closingNote": "A brief encouraging closing remark. Example: 'Overall, your store is on a good track. Keep an eye on afternoon traffic and you should see a nice improvement next week.'"
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

  return `Here is the complete analytics data from our restaurant self-ordering system. Please review it and give us your assessment as our operations supervisor.

=== OVERALL SUMMARY ===
Total Orders: ${summary.totalOrders || 0}
Total Revenue: ${summary.totalRevenue?.toFixed(2) || '0.00'}
Average Order Value: ${summary.averageOrderValue?.toFixed(2) || '0.00'}
Best Selling Item: ${formatProductName(summary.bestSellingItem || 'N/A')}
Least Selling Item: ${formatProductName(summary.leastSellingItem || 'N/A')}
Last Updated: ${summary.lastUpdated || 'N/A'}

=== CURRENT PERIOD ===
Today: ${todayAnalytics.orders || 0} orders, Revenue: ${todayAnalytics.revenue?.toFixed(2) || '0.00'}
This Week: ${weekAnalytics.orders || 0} orders, Revenue: ${weekAnalytics.revenue?.toFixed(2) || '0.00'}
This Month: ${monthAnalytics.orders || 0} orders, Revenue: ${monthAnalytics.revenue?.toFixed(2) || '0.00'}

=== AVERAGES ===
Mean Daily Orders: ${statistics.ordersPerDay?.mean || 0}
Median Daily Orders: ${statistics.ordersPerDay?.median || 0}
Mean Daily Revenue: ${statistics.revenuePerDay?.mean || 0}
Median Daily Revenue: ${statistics.revenuePerDay?.median || 0}

=== PRODUCTS (${productEntries.length} items) ===
${productSummary || 'No product data available.'}

=== DAILY TRENDS (Last 14 days) ===
${dailySummary || 'No daily data available.'}

=== HOURLY DISTRIBUTION ===
${hourlySummary}

=== WEEKLY TRENDS ===
${weeklySummary || 'No weekly data available.'}

=== MONTHLY TRENDS ===
${monthlySummary || 'No monthly data available.'}

Please give your honest assessment in the conversational JSON format.`;
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
      max_tokens: 2000,
      temperature: 0.6,
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
 * Returns a conversational analysis object
 *
 * @param {Object} analyticsData - All analytics data from Firebase
 * @param {string} branchId - Branch identifier for caching
 * @param {boolean} forceRefresh - Skip cache and regenerate
 * @returns {Promise<Object>} Conversational analysis
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

  // Validate and set defaults for conversational structure
  const defaultAnalysis = {
    greeting: '',
    overallHealth: '',
    topPerformers: '',
    concerns: '',
    quickWins: [],
    priorityActions: { urgent: [], recommended: [], longTerm: [] },
    closingNote: '',
    generatedAt: new Date().toISOString(),
    fromCache: false,
  };

  const result = { ...defaultAnalysis, ...analysis, generatedAt: new Date().toISOString(), fromCache: false };

  // Ensure priorityActions has correct structure
  if (!result.priorityActions || typeof result.priorityActions !== 'object') {
    result.priorityActions = { urgent: [], recommended: [], longTerm: [] };
  }
  result.priorityActions.urgent = result.priorityActions.urgent || [];
  result.priorityActions.recommended = result.priorityActions.recommended || [];
  result.priorityActions.longTerm = result.priorityActions.longTerm || [];

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
