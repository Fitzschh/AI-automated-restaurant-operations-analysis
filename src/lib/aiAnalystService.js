import { auth, fetchWithAppCheck, dbUrl } from './firebase';

const CACHE_KEY_PREFIX = 'ai_analyst_cache_v2_';
const CACHE_DURATION_MS = 30 * 60 * 1000;
const AI_ANALYSIS_ENDPOINT = '/api/ai-analysis';

async function readResponsePayload(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { rawText: text };
  }
}

function getResponseErrorMessage(response, payload) {
  if (payload?.error || payload?.detail || payload?.message) {
    return payload.error || payload.detail || payload.message;
  }

  if (response.status === 404) {
    return 'AI analysis endpoint was not found. Confirm the FastAPI backend is running on port 5001.';
  }

  if (response.status === 405) {
    return 'AI analysis endpoint rejected the request method. Confirm /api/ai-analysis is routed to the FastAPI backend.';
  }

  if (payload?.rawText) {
    return payload.rawText.slice(0, 180);
  }

  return `AI analysis failed with status ${response.status}.`;
}

function normalizeAnalysisMode(mode) {
  if (mode === 'deep') return 'deep';
  if (mode === 'live') return 'live';
  if (mode === 'briefing') return 'briefing';
  if (mode === 'leak') return 'leak';
  if (mode === 'simulation') return 'simulation';
  if (mode === 'opschat') return 'opschat';
  return 'realtime';
}

async function requestAnalysis(analyticsData, mode, branchId) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Please sign in again before generating AI analysis.');
  }

  let response;
  try {
    response = await fetch(AI_ANALYSIS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ analyticsData, mode, branchId }),
    });
  } catch (error) {
    throw new Error('AI analysis service is unavailable. Please check your connection and try again.');
  }

  const payload = await readResponsePayload(response);

  if (response.ok) {
    if (payload && !payload.rawText) {
      return payload;
    }
    throw new Error('AI analysis service returned an invalid response.');
  }

  throw new Error(getResponseErrorMessage(response, payload));
}

function getCacheKey(branchId, mode) {
  return `${CACHE_KEY_PREFIX}${branchId}_${mode}`;
}

function getCachedAnalysis(branchId, mode) {
  try {
    const key = getCacheKey(branchId, mode);
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

async function cacheAnalysis(branchId, mode, analysis) {
  try {
    const key = getCacheKey(branchId, mode);
    localStorage.setItem(key, JSON.stringify({
      timestamp: Date.now(),
      analysis,
    }));
    
    // Also save to Firebase
    if (mode === 'briefing') {
       const dateObj = new Date(analysis.generatedAt || Date.now());
       const dayStr = dateObj.toISOString().split('T')[0];
       const url = dbUrl(`${branchId}/shiftHandoffs/${dayStr}`);
       await fetchWithAppCheck(url, {
           method: 'PUT',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(analysis)
       });
    } else if (mode === 'live') {
       const dateObj = new Date(analysis.generatedAt || Date.now());
       const dayStr = dateObj.toISOString().split('T')[0];
       const hourStr = String(dateObj.getHours()).padStart(2, '0');
       const url = dbUrl(`${branchId}/hourlyAnalyses/${dayStr}_${hourStr}`);
       await fetchWithAppCheck(url, {
           method: 'PUT',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(analysis)
       });
    }
  } catch (err) {
    console.warn('[LiveAnalyst] Failed to save analysis to Firebase', err);
  }
}

export async function fetchAnalysisFromFirebase(branchId, mode, date = new Date()) {
  try {
    const dayStr = date.toISOString().split('T')[0];
    let url;
    if (mode === 'briefing') {
      url = dbUrl(`${branchId}/shiftHandoffs/${dayStr}`);
    } else if (mode === 'live') {
      const hourStr = String(date.getHours()).padStart(2, '0');
      url = dbUrl(`${branchId}/hourlyAnalyses/${dayStr}_${hourStr}`);
    } else {
      return null;
    }
    const res = await fetchWithAppCheck(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[LiveAnalyst] Failed to fetch from Firebase', err);
    return null;
  }
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function buildActiveProductIndex(inventory = {}) {
  const ids = new Set();
  const names = new Set();

  Object.entries(inventory || {}).forEach(([id, item]) => {
    ids.add(String(id));
    names.add(normalizeName(id));
    names.add(normalizeName(item?.productName || item?.name || item?.title));
  });

  names.delete('');

  return { ids, names };
}

function isActiveProduct(productId, product, activeIndex) {
  return activeIndex.ids.has(String(productId)) ||
    activeIndex.names.has(normalizeName(productId)) ||
    activeIndex.names.has(normalizeName(product?.name || product?.productName || product?.title));
}

function sanitizeAnalyticsForAI(analyticsData = {}) {
  const inventory = analyticsData.inventory || {};
  const activeIndex = buildActiveProductIndex(inventory);

  if (activeIndex.ids.size === 0 && activeIndex.names.size === 0) {
    return analyticsData;
  }

  const products = Object.fromEntries(
    Object.entries(analyticsData.products || {})
      .filter(([productId, product]) => isActiveProduct(productId, product, activeIndex))
  );

  const productEntries = Object.entries(products);
  const summary = { ...(analyticsData.summary || {}) };

  if (!isActiveProduct(summary.bestSellingItem, { name: summary.bestSellingItem }, activeIndex)) {
    const bestActive = productEntries
      .sort(([, a], [, b]) => Number(b.quantitySold || 0) - Number(a.quantitySold || 0))[0];
    summary.bestSellingItem = bestActive?.[1]?.name || bestActive?.[0] || '';
  }

  if (!isActiveProduct(summary.leastSellingItem, { name: summary.leastSellingItem }, activeIndex)) {
    const leastActive = productEntries
      .sort(([, a], [, b]) => Number(a.quantitySold || 0) - Number(b.quantitySold || 0))[0];
    summary.leastSellingItem = leastActive?.[1]?.name || leastActive?.[0] || '';
  }

  return {
    ...analyticsData,
    summary,
    products,
  };
}

export async function generateAIAnalysis(analyticsData, branchId, forceRefresh = false, mode = 'realtime') {
  const analysisMode = normalizeAnalysisMode(mode);
  const safeAnalyticsData = sanitizeAnalyticsForAI(analyticsData);

  if (!forceRefresh && branchId) {
    const cached = getCachedAnalysis(branchId, analysisMode);
    if (cached) {
      return { ...cached, fromCache: true };
    }
  }

  const analysis = await requestAnalysis(safeAnalyticsData, analysisMode, branchId);

  const defaultAnalysis = {
    mode: analysisMode,
    insight: null,
    greeting: '',
    overallHealth: '',
    topPerformers: '',
    concerns: '',
    shiftHandoff: null,
    quickWins: [],
    priorityActions: { urgent: [], recommended: [], longTerm: [] },
    closingNote: '',
    generatedAt: new Date().toISOString(),
    fromCache: false,
  };

  const result = { ...defaultAnalysis, ...analysis, generatedAt: new Date().toISOString(), fromCache: false };
  result.mode = normalizeAnalysisMode(result.mode || analysisMode);

  if (!result.priorityActions || typeof result.priorityActions !== 'object') {
    result.priorityActions = { urgent: [], recommended: [], longTerm: [] };
  }
  result.priorityActions.urgent = result.priorityActions.urgent || [];
  result.priorityActions.recommended = result.priorityActions.recommended || [];
  result.priorityActions.longTerm = result.priorityActions.longTerm || [];

  if (branchId) {
    await cacheAnalysis(branchId, analysisMode, result);
  }

  return result;
}

export function clearAnalysisCache(branchId, mode = null) {
  try {
    if (mode) {
      localStorage.removeItem(getCacheKey(branchId, mode));
      return;
    }

    Object.keys(localStorage)
      .filter((key) => key.startsWith(`${CACHE_KEY_PREFIX}${branchId}_`))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
  }
}
