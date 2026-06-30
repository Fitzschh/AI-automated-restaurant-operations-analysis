/**
 * Live Analyst Provider — Session-Level Background Service
 *
 * Manages the entire Live Operations Analyst lifecycle at the app level.
 * This provider lives above the router so it is NEVER unmounted by navigation.
 *
 * Lifecycle:
 *   1. Login → AI Shift Handoff completes → initial analysis
 *   2. Random 4–10 min interval → notification updates (no new analyses)
 *   3. Hourly boundary → fresh analysis with hour-over-hour comparisons
 *   4. Logout → destroy everything
 *
 * Page navigation has ZERO effect on this provider.
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { useAuth } from './AuthContext';
import { getUserBranch, isUserAdmin } from '../config/authConfig';
import {
  formatDateKey,
  formatWeekKey,
  formatMonthKey,
  onAnalyticsChange,
} from '../lib/analyticsApi';
import { onMenuAndInventoryChange } from '../lib/inventoryApi';
import { generateAIAnalysis, clearAnalysisCache, fetchAnalysisFromFirebase } from '../lib/aiAnalystService';
import {
  consumeShiftHandoffLoginTrigger,
  completeShiftHandoffLoginTrigger,
  failShiftHandoffLoginTrigger,
  getShiftHandoffToken,
  SHIFT_HANDOFF_STATUS,
} from '../lib/aiShiftHandoffSession';
import {
  computeHourlyComparison,
  takeOperationalSnapshot,
} from '../lib/agents/hourlyComparisonEngine';

// ─── Constants ──────────────────────────────────────────────────────────────

const MIN_NOTIFICATION_INTERVAL_MS = 4 * 60 * 1000;  // 4 minutes
const MAX_NOTIFICATION_INTERVAL_MS = 10 * 60 * 1000;  // 10 minutes
const INITIAL_ANALYSIS_DELAY_MS = 30 * 1000;           // 30s after handoff
const PREPARING_BRIEFING_MIN_MS = 5 * 1000;
const DAILY_BRIEFING_CACHE_VERSION = 'v4';

// ─── Context ────────────────────────────────────────────────────────────────

const LiveAnalystContext = createContext(null);

// ─── State Reducer ──────────────────────────────────────────────────────────

const Actions = {
  SET_FEED_ITEMS: 'SET_FEED_ITEMS',
  ADD_FEED_ITEM: 'ADD_FEED_ITEM',
  SET_PREPARING: 'SET_PREPARING',
  SET_GENERATING: 'SET_GENERATING',
  SET_ERROR: 'SET_ERROR',
  SET_BRIEFING_COMPLETE: 'SET_BRIEFING_COMPLETE',
  SET_NOTIFICATION_OPEN: 'SET_NOTIFICATION_OPEN',
  SET_ANALYTICS_DATA: 'SET_ANALYTICS_DATA',
  SET_INVENTORY_DATA: 'SET_INVENTORY_DATA',
  SET_INVENTORY_LOADED: 'SET_INVENTORY_LOADED',
  SET_ACTIVE_BRANCH: 'SET_ACTIVE_BRANCH',
  RESET: 'RESET',
};

function createInitialState() {
  return {
    feedItems: [],
    preparingBriefing: null,
    generating: false,
    error: null,
    briefingComplete: false,
    notificationOpen: false,
    analyticsData: null,
    inventoryData: {},
    inventoryLoaded: false,
    activeBranch: null,
  };
}

function liveAnalystReducer(state, action) {
  switch (action.type) {
    case Actions.SET_FEED_ITEMS:
      return { ...state, feedItems: action.payload };
    case Actions.ADD_FEED_ITEM: {
      const item = action.payload;
      const key = item.mode || 'default';
      const filtered = state.feedItems.filter(
        (f) => f.mode !== 'briefing-preparing' && (f.mode || 'default') !== key
      );
      return { ...state, feedItems: [...filtered, item].slice(-12) };
    }
    case Actions.SET_PREPARING:
      return { ...state, preparingBriefing: action.payload };
    case Actions.SET_GENERATING:
      return { ...state, generating: action.payload };
    case Actions.SET_ERROR:
      return { ...state, error: action.payload };
    case Actions.SET_BRIEFING_COMPLETE:
      return { ...state, briefingComplete: action.payload };
    case Actions.SET_NOTIFICATION_OPEN:
      return { ...state, notificationOpen: action.payload };
    case Actions.SET_ANALYTICS_DATA:
      return { ...state, analyticsData: action.payload };
    case Actions.SET_INVENTORY_DATA:
      return { ...state, inventoryData: action.payload };
    case Actions.SET_INVENTORY_LOADED:
      return { ...state, inventoryLoaded: action.payload };
    case Actions.SET_ACTIVE_BRANCH:
      return { ...state, activeBranch: action.payload };
    case Actions.RESET:
      return createInitialState();
    default:
      return state;
  }
}

// ─── Utility Functions ──────────────────────────────────────────────────────

function getRandomInterval() {
  return Math.floor(
    Math.random() * (MAX_NOTIFICATION_INTERVAL_MS - MIN_NOTIFICATION_INTERVAL_MS) +
      MIN_NOTIFICATION_INTERVAL_MS
  );
}

function getMsUntilNextHour() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(now.getHours() + 1, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function getTimeOfDayLabel(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'Morning';
  if (hour >= 11 && hour < 13) return 'Noon';
  if (hour >= 13 && hour < 18) return 'Afternoon';
  return 'Evening';
}

function formatBranchLabel(branchId) {
  const match = String(branchId || '').match(/^branch(\d+)$/i);
  if (match) return `Branch ${match[1]}`;
  return String(branchId || 'this branch')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getDailyBriefingKey(branchId, date = new Date()) {
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  return `ai_daily_briefing_${DAILY_BRIEFING_CACHE_VERSION}_${branchId}_${day}`;
}

function getDailyBriefingSessionKey(branchId, date = new Date()) {
  return `${getDailyBriefingKey(branchId, date)}_shown_this_session`;
}

function getHourlyReportKey(branchId, date) {
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  const hour = String(date.getHours()).padStart(2, '0');
  return `ai_live_feed_${branchId}_${day}_${hour}`;
}

function formatAsOfLabel(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function LiveAnalystProvider({ children }) {
  const { user, isAuthenticated, nicknameLoaded, nickname } = useAuth();
  const [state, dispatch] = useReducer(liveAnalystReducer, null, createInitialState);

  // ── Refs (survive re-renders, never cause re-triggers) ────────────
  const generatingRef = useRef(false);
  const briefingInFlightRef = useRef(false);
  const liveReportInFlightRef = useRef(false);
  const loginBriefingStartedRef = useRef(false);
  const loginBriefingTokenRef = useRef('');
  const preparingBriefingTokenRef = useRef('');
  const preparingBriefingVisibleUntilRef = useRef(0);
  const notificationTimerRef = useRef(null);
  const randomIntervalTimerRef = useRef(null);
  const hourlyTimerRef = useRef(null);
  const previousSnapshotRef = useRef(null);
  const analyticsUnsubRef = useRef(null);
  const inventoryUnsubRef = useRef(null);
  const mountedRef = useRef(true);

  // ── Determine active branch from user email ──────────────────────
  const activeBranch = useMemo(() => {
    if (!user?.email) return null;
    if (isUserAdmin(user.email)) return 'branch2'; // Admin defaults to branch2
    return getUserBranch(user.email) || null;
  }, [user?.email]);

  const branchLabel = useMemo(() => formatBranchLabel(activeBranch), [activeBranch]);

  // ── Computed analytics payload for AI calls ──────────────────────
  const currentKeys = useMemo(() => {
    const now = new Date();
    return {
      today: formatDateKey(now),
      week: formatWeekKey(now),
      month: formatMonthKey(now),
    };
  }, [activeBranch]);

  const aiAnalyticsData = useMemo(() => {
    const data = state.analyticsData;
    if (!data) return null;
    const daily = data.daily || {};
    const weekly = data.weekly || {};
    const monthly = data.monthly || {};
    return {
      summary: data.summary || {},
      products: data.products || {},
      inventory: state.inventoryData,
      daily,
      hourly: data.hourly || {},
      weekly,
      monthly,
      statistics: data.statistics || {},
      todayAnalytics: daily[currentKeys.today] || { orders: 0, revenue: 0, averageOrderValue: 0 },
      weekAnalytics: weekly[currentKeys.week] || { orders: 0, revenue: 0 },
      monthAnalytics: monthly[currentKeys.month] || { orders: 0, revenue: 0 },
    };
  }, [state.analyticsData, state.inventoryData, currentKeys]);

  const hasData = Number(aiAnalyticsData?.summary?.totalOrders || 0) > 0;

  // ── Firebase subscriptions ───────────────────────────────────────
  useEffect(() => {
    if (!activeBranch) return;

    // Analytics subscription
    if (analyticsUnsubRef.current) {
      analyticsUnsubRef.current();
      analyticsUnsubRef.current = null;
    }
    const unsubAnalytics = onAnalyticsChange(activeBranch, (data) => {
      if (mountedRef.current) {
        dispatch({ type: Actions.SET_ANALYTICS_DATA, payload: data });
      }
    });
    analyticsUnsubRef.current = unsubAnalytics;

    // Inventory subscription
    if (inventoryUnsubRef.current) {
      inventoryUnsubRef.current();
      inventoryUnsubRef.current = null;
    }
    dispatch({ type: Actions.SET_INVENTORY_LOADED, payload: false });
    const unsubInventory = onMenuAndInventoryChange(activeBranch, (data) => {
      if (mountedRef.current) {
        dispatch({ type: Actions.SET_INVENTORY_DATA, payload: data });
        dispatch({ type: Actions.SET_INVENTORY_LOADED, payload: true });
      }
    });
    inventoryUnsubRef.current = unsubInventory;

    return () => {
      if (analyticsUnsubRef.current) {
        analyticsUnsubRef.current();
        analyticsUnsubRef.current = null;
      }
      if (inventoryUnsubRef.current) {
        inventoryUnsubRef.current();
        inventoryUnsubRef.current = null;
      }
    };
  }, [activeBranch]);

  // ── Cleanup on unmount ───────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(notificationTimerRef.current);
      clearTimeout(randomIntervalTimerRef.current);
      clearTimeout(hourlyTimerRef.current);
    };
  }, []);

  // ── Reset everything on logout ───────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      console.log('[LiveAnalyst] Session destroyed — user logged out');
      dispatch({ type: Actions.RESET });
      clearTimeout(notificationTimerRef.current);
      clearTimeout(randomIntervalTimerRef.current);
      clearTimeout(hourlyTimerRef.current);
      generatingRef.current = false;
      briefingInFlightRef.current = false;
      liveReportInFlightRef.current = false;
      loginBriefingStartedRef.current = false;
      loginBriefingTokenRef.current = '';
      preparingBriefingTokenRef.current = '';
      previousSnapshotRef.current = null;
    }
  }, [isAuthenticated]);

  // ── Notification show/hide ───────────────────────────────────────
  const showNotification = useCallback((durationMs = 15000) => {
    dispatch({ type: Actions.SET_NOTIFICATION_OPEN, payload: true });
    clearTimeout(notificationTimerRef.current);
    if (durationMs !== null) {
      notificationTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          dispatch({ type: Actions.SET_NOTIFICATION_OPEN, payload: false });
        }
      }, durationMs);
    }
  }, []);

  const hideNotification = useCallback(() => {
    dispatch({ type: Actions.SET_NOTIFICATION_OPEN, payload: false });
    clearTimeout(notificationTimerRef.current);
  }, []);

  // ── Core generation function ─────────────────────────────────────
  const handleGenerate = useCallback(
    async (mode = 'realtime', forceRefresh = false, reportContext = null, revealNotification = true) => {
      if (generatingRef.current || !activeBranch || !aiAnalyticsData) return null;
      generatingRef.current = true;
      dispatch({ type: Actions.SET_GENERATING, payload: true });
      dispatch({ type: Actions.SET_ERROR, payload: null });

      try {
        if (forceRefresh) {
          clearAnalysisCache(activeBranch, mode);
        }
        const payload = reportContext
          ? { ...aiAnalyticsData, reportContext }
          : aiAnalyticsData;

        const result = await generateAIAnalysis(payload, activeBranch, forceRefresh, mode);

        if (mode === 'briefing') {
          // Wait for minimum preparing-briefing display time
          const remaining = preparingBriefingVisibleUntilRef.current - Date.now();
          if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
          dispatch({ type: Actions.SET_PREPARING, payload: null });
        }

        dispatch({ type: Actions.ADD_FEED_ITEM, payload: result });

        if (revealNotification && mountedRef.current) {
          showNotification();
        }
        return result;
      } catch (err) {
        console.error('[LiveAnalyst] Generation failed:', err);
        if (mode === 'briefing') {
          const remaining = preparingBriefingVisibleUntilRef.current - Date.now();
          if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
          dispatch({ type: Actions.SET_PREPARING, payload: null });
        }
        dispatch({ type: Actions.SET_ERROR, payload: err.message || 'Analysis failed.' });
        if (revealNotification && mountedRef.current) {
          showNotification();
        }
        return null;
      } finally {
        generatingRef.current = false;
        if (mountedRef.current) {
          dispatch({ type: Actions.SET_GENERATING, payload: false });
        }
      }
    },
    [activeBranch, aiAnalyticsData, showNotification]
  );

  // ── Daily Briefing (Shift Handoff) ───────────────────────────────
  const generateDailyBriefing = useCallback(async () => {
    if (!activeBranch || !hasData || briefingInFlightRef.current) return;

    const sessionKey = getDailyBriefingSessionKey(activeBranch);
    const alreadyShown = sessionStorage.getItem(sessionKey) === '1';

    if (alreadyShown) {
      completeShiftHandoffLoginTrigger();
      dispatch({ type: Actions.SET_BRIEFING_COMPLETE, payload: true });
      return;
    }

    briefingInFlightRef.current = true;
    try {
      const result = await handleGenerate('briefing', true, {
        asOfLabel: 'AI Shift Handoff',
        branchLabel,
        managerNickname: nickname?.trim() || 'Manager',
        timeOfDayLabel: getTimeOfDayLabel(),
        generatedFor: new Date().toISOString(),
      });
      if (result) {
        const key = getDailyBriefingKey(activeBranch);
        sessionStorage.setItem(key, JSON.stringify(result));
        sessionStorage.setItem(sessionKey, '1');
        completeShiftHandoffLoginTrigger();
        console.log('[LiveAnalyst] Shift handoff complete');
      } else {
        failShiftHandoffLoginTrigger();
      }
    } finally {
      briefingInFlightRef.current = false;
      if (mountedRef.current) {
        dispatch({ type: Actions.SET_BRIEFING_COMPLETE, payload: true });
      }
    }
  }, [activeBranch, branchLabel, handleGenerate, hasData, nickname]);

  // ── Hourly Live Report ───────────────────────────────────────────
  const generateLiveReport = useCallback(
    async (date) => {
      if (!activeBranch || !hasData || liveReportInFlightRef.current) return;
      if (date.getHours() < 7) return;

      const key = getHourlyReportKey(activeBranch, date);
      const saved = localStorage.getItem(key);
      let parsed = null;
      if (saved) {
        try {
          parsed = JSON.parse(saved);
        } catch {
          localStorage.removeItem(key);
        }
      }
      
      if (!parsed) {
         const fbData = await fetchAnalysisFromFirebase(activeBranch, 'live', date);
         if (fbData && fbData.generatedAt) parsed = fbData;
      }

      if (parsed?.generatedAt) {
        dispatch({ type: Actions.ADD_FEED_ITEM, payload: parsed });
        showNotification();
        return;
      }

      liveReportInFlightRef.current = true;
      try {
        // Take snapshot and compute comparison
        const currentSnapshot = takeOperationalSnapshot(aiAnalyticsData, state.inventoryData);
        const comparison = computeHourlyComparison(currentSnapshot, previousSnapshotRef.current);
        previousSnapshotRef.current = currentSnapshot;

        const result = await handleGenerate('live', true, {
          asOfLabel: formatAsOfLabel(date),
          scheduledHour: date.getHours(),
          generatedFor: date.toISOString(),
          hourlyComparison: comparison.hasPreviousData ? comparison : null,
          comparisonInsights: comparison.insights,
        });
        if (result) {
          localStorage.setItem(key, JSON.stringify(result));
          console.log('[LiveAnalyst] Hourly cycle triggered — fresh analysis generated');
        }
      } finally {
        liveReportInFlightRef.current = false;
      }
    },
    [activeBranch, aiAnalyticsData, handleGenerate, hasData, showNotification, state.inventoryData]
  );

  // ── Detect shift handoff trigger (once on login) ─────────────────
  const [loginBriefingRequested, setLoginBriefingRequested] = useReducer(() => true, false);

  useEffect(() => {
    if (!activeBranch || !isAuthenticated) return;

    const trigger = consumeShiftHandoffLoginTrigger();
    if (!trigger) return;

    loginBriefingTokenRef.current = trigger.token;
    setLoginBriefingRequested();
    console.log('[LiveAnalyst] Shift handoff trigger consumed');
  }, [activeBranch, isAuthenticated]);

  // ── Restore cached briefing on re-entry (no new trigger) ────────
  useEffect(() => {
    if (!activeBranch || loginBriefingRequested) return;

    async function restoreBriefing() {
      const key = getDailyBriefingKey(activeBranch);
      const saved = sessionStorage.getItem(key);
      let parsed = null;
      if (saved) {
        try {
          parsed = JSON.parse(saved);
        } catch (e) {
          console.error('[LiveAnalyst] Failed to parse cached briefing:', e);
        }
      }

      if (!parsed) {
        const fbData = await fetchAnalysisFromFirebase(activeBranch, 'briefing', new Date());
        if (fbData && fbData.generatedAt) parsed = fbData;
      }

      if (parsed?.generatedAt) {
        dispatch({ type: Actions.ADD_FEED_ITEM, payload: parsed });
      }
      dispatch({ type: Actions.SET_BRIEFING_COMPLETE, payload: true });
    }
    
    restoreBriefing();
  }, [activeBranch, loginBriefingRequested]);

  // ── Execute briefing when data is ready ──────────────────────────
  useEffect(() => {
    if (!activeBranch || !loginBriefingRequested) return;
    if (!nicknameLoaded) return;

    // Show preparing state
    const loginToken = loginBriefingTokenRef.current || getShiftHandoffToken() || 'current-session';
    if (preparingBriefingTokenRef.current !== loginToken) {
      preparingBriefingTokenRef.current = loginToken;
      preparingBriefingVisibleUntilRef.current = Date.now() + PREPARING_BRIEFING_MIN_MS;
      dispatch({
        type: Actions.SET_PREPARING,
        payload: {
          mode: 'briefing-preparing',
          generatedAt: new Date().toISOString(),
          greeting: `Good ${getTimeOfDayLabel()}, ${nickname?.trim() || 'Manager'}.`,
          branchWelcome: `Welcome to ${branchLabel}.`,
          message: 'I am preparing your AI Shift Handoff from the latest branch data.',
        },
      });
      dispatch({ type: Actions.SET_ERROR, payload: null });
      showNotification(null); // Keep open until briefing finishes
    }

    if (!hasData || !state.inventoryLoaded) return;
    if (loginBriefingStartedRef.current) return;

    loginBriefingStartedRef.current = true;
    generateDailyBriefing();
  }, [
    activeBranch,
    branchLabel,
    generateDailyBriefing,
    hasData,
    state.inventoryLoaded,
    loginBriefingRequested,
    nicknameLoaded,
    nickname,
    showNotification,
  ]);

  // ── Random interval notifications (4–10 min) ────────────────────
  useEffect(() => {
    if (!activeBranch || !hasData || !state.briefingComplete) return;

    function scheduleNextNotification() {
      const ms = getRandomInterval();
      console.log(`[LiveAnalyst] Notification scheduled: ${Math.round(ms / 1000)}s`);
      randomIntervalTimerRef.current = setTimeout(async () => {
        if (!mountedRef.current) return;
        await generateLiveReport(new Date());
        if (mountedRef.current) {
          scheduleNextNotification();
        }
      }, ms);
    }

    // Initial report after delay, then enter the random cycle
    const initialTimer = setTimeout(async () => {
      if (!mountedRef.current) return;
      // Take initial snapshot for future comparisons
      if (aiAnalyticsData) {
        previousSnapshotRef.current = takeOperationalSnapshot(aiAnalyticsData, state.inventoryData);
      }
      await generateLiveReport(new Date());
      if (mountedRef.current) {
        scheduleNextNotification();
      }
    }, INITIAL_ANALYSIS_DELAY_MS);

    return () => {
      clearTimeout(initialTimer);
      clearTimeout(randomIntervalTimerRef.current);
    };
  }, [activeBranch, state.briefingComplete, hasData, generateLiveReport, aiAnalyticsData, state.inventoryData]);

  // ── Hourly analysis cycle ────────────────────────────────────────
  useEffect(() => {
    if (!activeBranch || !hasData || !state.briefingComplete) return;

    function scheduleHourly() {
      const ms = getMsUntilNextHour();
      console.log(`[LiveAnalyst] Hourly cycle in ${Math.round(ms / 60000)} minutes`);
      hourlyTimerRef.current = setTimeout(async () => {
        if (!mountedRef.current) return;
        console.log('[LiveAnalyst] Hourly cycle triggered');
        // Clear cached reports for this hour to force fresh generation
        if (activeBranch) {
          clearAnalysisCache(activeBranch, 'live');
        }
        await generateLiveReport(new Date());
        if (mountedRef.current) {
          scheduleHourly();
        }
      }, ms);
    }

    scheduleHourly();

    return () => {
      clearTimeout(hourlyTimerRef.current);
    };
  }, [activeBranch, state.briefingComplete, hasData, generateLiveReport]);

  // ── Context value ────────────────────────────────────────────────
  const latestFeedItem = state.feedItems[state.feedItems.length - 1] || null;
  const analysis = state.preparingBriefing || latestFeedItem;

  const contextValue = useMemo(
    () => ({
      // State
      feedItems: state.feedItems,
      latestAnalysis: analysis,
      preparingBriefing: state.preparingBriefing,
      generating: state.generating,
      error: state.error,
      briefingComplete: state.briefingComplete,
      notificationOpen: state.notificationOpen,
      analyticsData: aiAnalyticsData,
      inventoryData: state.inventoryData,
      inventoryLoaded: state.inventoryLoaded,
      activeBranch,
      hasData,

      // Actions
      showNotification,
      hideNotification,
      generateAnalysis: handleGenerate,
      setNotificationOpen: (open) =>
        dispatch({ type: Actions.SET_NOTIFICATION_OPEN, payload: open }),
    }),
    [
      state,
      analysis,
      aiAnalyticsData,
      activeBranch,
      hasData,
      showNotification,
      hideNotification,
      handleGenerate,
    ]
  );

  return (
    <LiveAnalystContext.Provider value={contextValue}>
      {children}
    </LiveAnalystContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useLiveAnalyst() {
  const ctx = useContext(LiveAnalystContext);
  if (!ctx) {
    throw new Error('useLiveAnalyst must be used within a LiveAnalystProvider.');
  }
  return ctx;
}

export default LiveAnalystContext;
