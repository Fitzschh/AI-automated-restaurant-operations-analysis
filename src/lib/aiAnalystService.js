import { auth } from './firebase';

const CACHE_KEY_PREFIX = 'ai_analyst_cache_';
const CACHE_DURATION_MS = 30 * 60 * 1000;

async function requestAnalysis(analyticsData) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Please sign in again before generating AI analysis.');
  }

  const response = await fetch('/api/ai-analysis', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ analyticsData }),
  });

  if (!response.ok) {
    let errorMessage = 'AI analysis failed. Please try again.';
    try {
      const data = await response.json();
      if (data?.error) errorMessage = data.error;
    } catch {
      errorMessage = `AI analysis failed with status ${response.status}.`;
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

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

function cacheAnalysis(branchId, analysis) {
  try {
    const key = CACHE_KEY_PREFIX + branchId;
    localStorage.setItem(key, JSON.stringify({
      timestamp: Date.now(),
      analysis,
    }));
  } catch {
  }
}

export async function generateAIAnalysis(analyticsData, branchId, forceRefresh = false) {
  if (!forceRefresh && branchId) {
    const cached = getCachedAnalysis(branchId);
    if (cached) {
      return { ...cached, fromCache: true };
    }
  }

  const analysis = await requestAnalysis(analyticsData);

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

  if (!result.priorityActions || typeof result.priorityActions !== 'object') {
    result.priorityActions = { urgent: [], recommended: [], longTerm: [] };
  }
  result.priorityActions.urgent = result.priorityActions.urgent || [];
  result.priorityActions.recommended = result.priorityActions.recommended || [];
  result.priorityActions.longTerm = result.priorityActions.longTerm || [];

  if (branchId) {
    cacheAnalysis(branchId, result);
  }

  return result;
}

export function clearAnalysisCache(branchId) {
  try {
    localStorage.removeItem(CACHE_KEY_PREFIX + branchId);
  } catch {
  }
}
