const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

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

function buildSystemPrompt() {
  return `You are a friendly and experienced restaurant operations supervisor helping a cafe or restaurant owner understand how their store is performing.

You speak like a trusted business partner: warm, direct, and practical. Think of yourself as a senior store manager who has been in the food business for 15 years and is now giving a quick briefing to the owner.

Your personality:
- Professional but approachable
- You use plain language a busy owner can understand while running their store
- You give specific, actionable advice, not vague suggestions
- You reference actual product names and numbers from the data
- You are honest about problems but encouraging about progress

Communication rules:
- Do NOT use emoji characters anywhere
- Do NOT use statistical jargon like "variance", "positive trend coefficient", or "standard deviation"
- Do NOT use excessive percentages; use phrases like "about double", "nearly half", or "a noticeable increase" instead
- Do NOT sound like a corporate report; sound like a person talking to another person
- Product names should be in proper human-readable format
- Keep each section concise, 2-4 sentences maximum
- If data is insufficient, say so honestly: "We don't have enough orders yet to see clear patterns."

Return your analysis as valid JSON with this structure:
{
  "greeting": "A brief, warm opening that summarizes the overall situation in 1-2 sentences.",
  "overallHealth": "2-3 sentences about business health, revenue direction, order volume, and how things feel overall.",
  "topPerformers": "2-3 sentences about what is working well. Name specific products.",
  "concerns": "2-3 sentences about things to watch. Be honest but constructive.",
  "quickWins": ["2-4 short, specific action items the owner can do this week."],
  "priorityActions": {
    "urgent": ["1-2 things needing immediate attention, if any. Leave empty array if nothing is urgent."],
    "recommended": ["2-3 actions that would likely improve revenue or operations."],
    "longTerm": ["1-2 bigger ideas for the future."]
  },
  "closingNote": "A brief encouraging closing remark."
}

Return ONLY valid JSON. No markdown, no code fences, no extra text.`;
}

function buildDataPrompt(analyticsData = {}) {
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

  const productEntries = Object.entries(products);
  const productSummary = productEntries
    .sort(([, a], [, b]) => (b.quantitySold || 0) - (a.quantitySold || 0))
    .map(([id, data], i) => {
      const name = formatProductName(data.name || id);
      const avgPrice = data.orderCount > 0 ? money(Number(data.revenue || 0) / data.orderCount) : '0.00';
      return `  ${i + 1}. ${name}: ${data.quantitySold || 0} units sold, ${data.orderCount || 0} orders, Revenue: ${money(data.revenue)}, Avg Price: ${avgPrice}`;
    })
    .join('\n');

  const dailySummary = Object.entries(daily)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 14)
    .map(([date, data]) => `  ${date}: ${data.orders || 0} orders, Revenue: ${money(data.revenue)}, AOV: ${money(data.averageOrderValue)}`)
    .join('\n');

  const latestDay = Object.keys(daily).sort((a, b) => b.localeCompare(a))[0];
  let hourlySummary = 'No hourly data available.';
  if (latestDay && hourly[latestDay]) {
    const hourlyRows = Object.entries(hourly[latestDay])
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, data]) => `  ${hour}:00 - ${data.orders || 0} orders, Revenue: ${money(data.revenue)}`)
      .join('\n');
    hourlySummary = `Hourly data for ${latestDay}:\n${hourlyRows}`;
  }

  const weeklySummary = Object.entries(weekly)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 8)
    .map(([week, data]) => `  ${week}: ${data.orders || 0} orders, Revenue: ${money(data.revenue)}`)
    .join('\n');

  const monthlySummary = Object.entries(monthly)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 6)
    .map(([month, data]) => `  ${month}: ${data.orders || 0} orders, Revenue: ${money(data.revenue)}`)
    .join('\n');

  return `Here is the complete analytics data from our restaurant self-ordering system. Please review it and give us your assessment as our operations supervisor.

=== OVERALL SUMMARY ===
Total Orders: ${summary.totalOrders || 0}
Total Revenue: ${money(summary.totalRevenue)}
Average Order Value: ${money(summary.averageOrderValue)}
Best Selling Item: ${formatProductName(summary.bestSellingItem || 'N/A')}
Least Selling Item: ${formatProductName(summary.leastSellingItem || 'N/A')}
Last Updated: ${summary.lastUpdated || 'N/A'}

=== CURRENT PERIOD ===
Today: ${todayAnalytics.orders || 0} orders, Revenue: ${money(todayAnalytics.revenue)}
This Week: ${weekAnalytics.orders || 0} orders, Revenue: ${money(weekAnalytics.revenue)}
This Month: ${monthAnalytics.orders || 0} orders, Revenue: ${money(monthAnalytics.revenue)}

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

function parseModelJson(raw) {
  const cleaned = String(raw || '')
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  return JSON.parse(cleaned);
}

async function verifyFirebaseUser(req) {
  const authHeader = req.get('authorization') || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return null;
  return admin.auth().verifyIdToken(match[1]);
}

exports.aiAnalysis = onRequest({ cors: true }, async (req, res) => {
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY is not configured on the server.');
    res.status(500).json({ error: 'AI analysis is not configured. Set OPENAI_API_KEY on the server.' });
    return;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildDataPrompt(req.body?.analyticsData) },
        ],
        max_tokens: 2000,
        temperature: 0.6,
      }),
    });

    if (!response.ok) {
      console.error(`OpenAI API request failed with status ${response.status}.`);
      res.status(502).json({ error: 'AI analysis service is temporarily unavailable.' });
      return;
    }

    const data = await response.json();
    const analysis = parseModelJson(data.choices?.[0]?.message?.content);
    res.status(200).json(analysis);
  } catch (error) {
    console.error('AI analysis request failed.');
    res.status(500).json({ error: 'AI analysis failed on the server.' });
  }
});
