import { useState, useCallback, useRef, useEffect } from 'react';
import { generateAIAnalysis, clearAnalysisCache } from '../../lib/aiAnalystService';
import { BotIcon } from './AnalyticsIcons';
import styles from './AIFloatingChat.module.css';

const DAILY_BRIEFING_DELAY_MS = 30 * 1000;
const FIRST_LIVE_REPORT_DELAY_MS = 30 * 1000;
const PREPARING_BRIEFING_MIN_MS = 5 * 1000;
const DAILY_BRIEFING_CACHE_VERSION = 'v3';

function formatAsOfLabel(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function createPreparingBriefing(managerNickname, branchLabel) {
  const displayName = managerNickname?.trim() || 'Manager';
  const timeOfDay = getTimeOfDayLabel();

  return {
    mode: 'briefing-preparing',
    generatedAt: new Date().toISOString(),
    greeting: `Good ${timeOfDay}, ${displayName}.`,
    branchWelcome: `Welcome to ${branchLabel}.`,
    message: 'I am preparing your AI Shift Handoff from the latest branch data.',
  };
}

function clearStoredLiveFeedCache(branchId) {
  try {
    const prefix = `ai_live_feed_${branchId}_`;
    Object.keys(localStorage)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
  }
}

function AnalysisMessages({ analysis }) {
  if (!analysis) return null;

  if (analysis.mode === 'briefing-preparing') {
    return (
      <div className={`${styles.messageBubble} ${styles.ai} ${styles.preparingBubble}`}>
        <div className={styles.quickHeader}>
          <span className={styles.aiBullet} />
          <span>AI Shift Handoff</span>
        </div>
        {analysis.greeting && (
          <p className={styles.handoffGreeting}>{analysis.greeting}</p>
        )}
        {analysis.branchWelcome && (
          <p className={styles.handoffWelcome}>{analysis.branchWelcome}</p>
        )}
        <p className={styles.aiSectionText}>{analysis.message}</p>
        <div className={styles.inlineLoadingDots} aria-hidden="true">
          <span className={styles.loadingDot} />
          <span className={styles.loadingDot} />
          <span className={styles.loadingDot} />
        </div>
      </div>
    );
  }

  if (analysis.mode === 'briefing') {
    const handoff = analysis.shiftHandoff || {};
    const highPriority = handoff.recommendation || analysis.recommendedActions?.high?.[0];
    const riskText = Array.isArray(handoff.inventoryRisks)
      ? handoff.inventoryRisks.join(' ')
      : handoff.inventoryRisks;
    const handoffRows = [
      ['Yesterday Revenue', handoff.yesterdayRevenue],
      ['Top Product', handoff.topProduct],
      ['Fastest Growing Product', handoff.fastestGrowingProduct],
      ['Inventory Risks', riskText],
      ['Operational Insight', handoff.operationalInsight],
      ['Recommendation', highPriority],
      ['Potential Revenue Opportunity', handoff.potentialRevenueOpportunity],
    ].filter(([, value]) => value);

    return (
      <>
        <div className={`${styles.messageBubble} ${styles.ai} ${styles.briefingBubble}`}>
          <div className={styles.quickHeader}>
            <span className={styles.aiBullet} />
            <span>AI Shift Handoff</span>
          </div>
          {(analysis.greeting || analysis.branchWelcome) && (
            <div className={styles.handoffIntro}>
              {analysis.greeting && <p className={styles.handoffGreeting}>{analysis.greeting}</p>}
              {analysis.branchWelcome && <p className={styles.handoffWelcome}>{analysis.branchWelcome}</p>}
            </div>
          )}
          {handoffRows.length > 0 ? (
            <div className={styles.handoffGrid}>
              {handoffRows.map(([label, value]) => (
                <div key={label} className={styles.handoffMetric}>
                  <span className={styles.handoffLabel}>{label}</span>
                  <span className={styles.handoffValue}>{value}</span>
                </div>
              ))}
            </div>
          ) : analysis.executiveSummary && (
            <p className={styles.aiSectionText}>{analysis.executiveSummary}</p>
          )}
          {analysis.confidenceScore !== undefined && (
            <p className={styles.confidenceLine}>Confidence {analysis.confidenceScore}%</p>
          )}
        </div>

        {analysis.generatedAt && (
          <div className={styles.messageTime}>
            {analysis.fromCache ? 'Cached handoff' : 'Fresh handoff'} — {new Date(analysis.generatedAt).toLocaleTimeString()}
          </div>
        )}
      </>
    );
  }

  if (analysis.mode === 'deep') {
    const sections = [
      { title: 'Revenue Performance', data: analysis.revenuePerformance },
      { title: 'Product Performance', data: analysis.productPerformance },
      { title: 'Inventory Analysis', data: analysis.inventoryAnalysis },
      { title: 'Peak Hour Analysis', data: analysis.peakHourAnalysis },
    ];

    return (
      <>
        {sections.map((section, i) => (
          <div
            key={section.title}
            className={`${styles.messageBubble} ${styles.ai}`}
            style={{ animationDelay: `${i * 0.08}s` }}
          >
            <div className={styles.aiSection}>
              <h4 className={styles.aiSectionTitle}>{section.title}</h4>
            </div>
            {section.data?.summary && (
              <p className={styles.aiSectionText}>{section.data.summary}</p>
            )}
            {['insights', 'anomalies', 'topSelling', 'worstPerforming', 'fastestGrowing', 'decliningDemand', 'stockOutRisks', 'restockRecommendations', 'busiestHours', 'slowestHours', 'recommendations'].map((key) => (
              Array.isArray(section.data?.[key]) && section.data[key].length > 0 ? (
                <ul key={key} className={styles.aiList}>
                  {section.data[key].map((item, j) => (
                    <li key={`${key}-${j}`} className={styles.aiListItem}>
                      <span className={styles.aiBullet} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null
            ))}
          </div>
        ))}

        {analysis.operationalRecommendations && (
          <div className={`${styles.messageBubble} ${styles.ai}`}>
            <div className={styles.aiSection}>
              <h4 className={styles.aiSectionTitle}>Operational Recommendations</h4>
            </div>
            {[
              ['HIGH', analysis.operationalRecommendations.high, styles.priorityHigh],
              ['MEDIUM', analysis.operationalRecommendations.medium, styles.priorityMedium],
              ['LOW', analysis.operationalRecommendations.low, styles.priorityLow],
            ].map(([label, items, priorityClass]) => (
              Array.isArray(items) && items.length > 0 ? (
                <div key={label} className={styles.priorityGroup}>
                  <p className={styles.priorityLabel}>{label}</p>
                  <ul className={styles.aiList}>
                    {items.map((item, i) => (
                      <li key={`${label}-${i}`} className={styles.aiListItem}>
                        <span className={`${styles.aiBullet} ${priorityClass}`} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null
            ))}
          </div>
        )}

        {analysis.executiveSummary && (
          <div className={`${styles.messageBubble} ${styles.ai}`}>
            <div className={styles.aiSection}>
              <h4 className={styles.aiSectionTitle}>Executive Summary</h4>
            </div>
            <p className={styles.aiSectionText}>{analysis.executiveSummary}</p>
          </div>
        )}

        {analysis.generatedAt && (
          <div className={styles.messageTime}>
            {analysis.fromCache ? 'Cached report' : 'Fresh report'} — {new Date(analysis.generatedAt).toLocaleTimeString()}
          </div>
        )}
      </>
    );
  }

  if (analysis.insight) {
    const priorityClass =
      analysis.insight.priority === 'HIGH' ? styles.priorityHigh :
      analysis.insight.priority === 'MEDIUM' ? styles.priorityMedium :
      analysis.insight.priority === 'LOW' ? styles.priorityLow : '';
    const freshnessLabel = analysis.mode === 'live' ? 'live update' : 'insight';

    return (
      <>
        <div className={`${styles.messageBubble} ${styles.ai} ${styles.quickInsight}`}>
          <div className={styles.quickHeader}>
            <span className={`${styles.aiBullet} ${priorityClass}`} />
            <span>{analysis.insight.priority || 'Quick Read'}</span>
          </div>
          {analysis.insight.message && (
            <p className={styles.aiSectionText}>{analysis.insight.message}</p>
          )}
          {analysis.insight.action && (
            <p className={styles.quickAction}>
              <span className={styles.actionLabel}>Action:</span> {analysis.insight.action}
            </p>
          )}
        </div>

        {analysis.generatedAt && (
          <div className={styles.messageTime}>
            {analysis.fromCache ? `Cached ${freshnessLabel}` : `Fresh ${freshnessLabel}`} — {new Date(analysis.generatedAt).toLocaleTimeString()}
          </div>
        )}
      </>
    );
  }

  if (Array.isArray(analysis.notifications) && analysis.notifications.length > 0) {
    const notification = analysis.notifications[0];
    const priorityClass =
      notification.priority === 'HIGH' ? styles.priorityHigh :
      notification.priority === 'MEDIUM' ? styles.priorityMedium :
      notification.priority === 'LOW' ? styles.priorityLow : '';

    return (
      <>
        <div className={`${styles.messageBubble} ${styles.ai} ${styles.quickInsight}`}>
          <div className={styles.quickHeader}>
            <span className={`${styles.aiBullet} ${priorityClass}`} />
            <span>{notification.priority || 'Quick Read'}</span>
          </div>
          <p className={styles.aiSectionText}>
            {[notification.whatHappened, notification.whyItMatters].filter(Boolean).join(' ')}
          </p>
          {notification.recommendedAction && (
            <p className={styles.quickAction}>
              <span className={styles.actionLabel}>Action:</span> {notification.recommendedAction}
            </p>
          )}
        </div>

        {analysis.generatedAt && (
          <div className={styles.messageTime}>
            {analysis.fromCache ? 'Cached insight' : 'Fresh insight'} — {new Date(analysis.generatedAt).toLocaleTimeString()}
          </div>
        )}
      </>
    );
  }

  const sections = [];

  if (analysis.greeting) {
    sections.push({ title: null, content: analysis.greeting });
  }

  if (analysis.overallHealth) {
    sections.push({ title: 'Business Health', content: analysis.overallHealth });
  }

  if (analysis.topPerformers) {
    sections.push({ title: 'Top Performers', content: analysis.topPerformers });
  }

  if (analysis.concerns) {
    sections.push({ title: 'Watch Out For', content: analysis.concerns });
  }

  if (analysis.quickWins && analysis.quickWins.length > 0) {
    sections.push({
      title: 'Quick Actions',
      list: analysis.quickWins,
      bulletType: 'accent',
    });
  }

  if (analysis.priorityActions) {
    const { urgent, recommended, longTerm } = analysis.priorityActions;
    if (urgent && urgent.length > 0) {
      sections.push({ title: 'Urgent', list: urgent, bulletType: 'high' });
    }
    if (recommended && recommended.length > 0) {
      sections.push({ title: 'Recommended', list: recommended, bulletType: 'medium' });
    }
    if (longTerm && longTerm.length > 0) {
      sections.push({ title: 'Long-term Ideas', list: longTerm, bulletType: 'low' });
    }
  }

  if (analysis.closingNote) {
    sections.push({ title: null, content: analysis.closingNote });
  }

  return (
    <>
      {sections.map((section, i) => (
        <div
          key={i}
          className={`${styles.messageBubble} ${styles.ai}`}
          style={{ animationDelay: `${i * 0.08}s` }}
        >
          {section.title && (
            <div className={styles.aiSection}>
              <h4 className={styles.aiSectionTitle}>{section.title}</h4>
            </div>
          )}
          {section.content && (
            <p className={styles.aiSectionText}>{section.content}</p>
          )}
          {section.list && (
            <ul className={styles.aiList}>
              {section.list.map((item, j) => (
                <li key={j} className={styles.aiListItem}>
                  <span
                    className={`${styles.aiBullet} ${
                      section.bulletType === 'high' ? styles.priorityHigh :
                      section.bulletType === 'medium' ? styles.priorityMedium :
                      section.bulletType === 'low' ? styles.priorityLow : ''
                    }`}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {analysis.generatedAt && (
        <div className={styles.messageTime}>
          {analysis.fromCache ? 'Cached analysis' : 'Fresh analysis'} — {new Date(analysis.generatedAt).toLocaleTimeString()}
        </div>
      )}
    </>
  );
}

export default function AILiveNotificationBar({
  analyticsData,
  branchId,
  managerNickname,
  nicknameLoaded = true,
  inventoryLoaded = true,
}) {
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [feedItems, setFeedItems] = useState([]);
  const [preparingBriefing, setPreparingBriefing] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [briefingComplete, setBriefingComplete] = useState(false);
  const bodyRef = useRef(null);
  const analyticsSignatureRef = useRef('');
  const generatingRef = useRef(false);
  const liveReportInFlightRef = useRef(false);
  const briefingInFlightRef = useRef(false);
  const preparingBriefingTokenRef = useRef('');
  const preparingBriefingVisibleUntilRef = useRef(0);
  const notificationTimerRef = useRef(null);
  const latestFeedItem = feedItems[feedItems.length - 1] || null;
  const analysis = preparingBriefing || latestFeedItem;
  const hasData = analyticsData?.summary?.totalOrders > 0;
  const panelVisible = notificationOpen;
  const branchLabel = formatBranchLabel(branchId);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [feedItems, generating, preparingBriefing]);

  useEffect(() => () => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
  }, []);

  const showNotification = useCallback((durationMs = 15 * 1000) => {
    setNotificationOpen(true);

    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
      notificationTimerRef.current = null;
    }

    if (durationMs === null) {
      return;
    }

    notificationTimerRef.current = setTimeout(() => {
      setNotificationOpen(false);
      notificationTimerRef.current = null;
    }, durationMs);
  }, []);

  const showPreparingBriefing = useCallback(() => {
    const loginToken = sessionStorage.getItem('ai_daily_briefing_pending_at') || 'current-session';
    if (preparingBriefingTokenRef.current === loginToken) return;

    const now = Date.now();
    preparingBriefingTokenRef.current = loginToken;
    preparingBriefingVisibleUntilRef.current = now + PREPARING_BRIEFING_MIN_MS;
    setError(null);
    setPreparingBriefing(createPreparingBriefing(managerNickname, branchLabel));
    showNotification(null);
  }, [branchLabel, managerNickname, showNotification]);

  const waitForPreparingBriefingMinimum = useCallback(async () => {
    const visibleUntil = preparingBriefingVisibleUntilRef.current;
    if (!visibleUntil) return;

    const remaining = visibleUntil - Date.now();
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }, []);

  const handleGenerate = useCallback(async (mode = 'realtime', forceRefresh = false, reportContext = null, revealNotification = true) => {
    if (generatingRef.current) return null;
    generatingRef.current = true;
    setGenerating(true);
    setError(null);

    try {
      if (forceRefresh) {
        clearAnalysisCache(branchId, mode);
      }
      const payload = reportContext
        ? { ...analyticsData, reportContext }
        : analyticsData;
      const result = await generateAIAnalysis(payload, branchId, forceRefresh, mode);
      if (mode === 'briefing') {
        await waitForPreparingBriefingMinimum();
        setPreparingBriefing(null);
      }
      setFeedItems((items) => [
        ...items.filter((item) => item.mode !== 'briefing-preparing'),
        result,
      ].slice(-12));
      if (revealNotification) {
        showNotification();
      }
      return result;
    } catch (err) {
      console.error('[AI Live Notifications] Generation failed:', err);
      if (mode === 'briefing') {
        await waitForPreparingBriefingMinimum();
        setPreparingBriefing(null);
      }
      setError(err.message || 'Analysis failed. Please try again.');
      if (mode === 'briefing') {
        setFeedItems((items) => items.filter((item) => item.mode !== 'briefing-preparing'));
      }
      if (revealNotification) {
        showNotification();
      }
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  }, [analyticsData, branchId, showNotification, waitForPreparingBriefingMinimum]);

  const generateDailyBriefing = useCallback(async () => {
    if (!branchId || !hasData || briefingInFlightRef.current) return;

    const key = getDailyBriefingKey(branchId);
    const sessionKey = getDailyBriefingSessionKey(branchId);
    const pendingLoginBriefing = sessionStorage.getItem('ai_daily_briefing_pending') === '1';
    const alreadyShown = sessionStorage.getItem(sessionKey) === '1';

    if (!pendingLoginBriefing && alreadyShown) {
      setBriefingComplete(true);
      return;
    }

    const savedBriefing = pendingLoginBriefing ? null : sessionStorage.getItem(key);
    if (savedBriefing) {
      try {
        const parsed = JSON.parse(savedBriefing);
        if (parsed?.generatedAt) {
          await waitForPreparingBriefingMinimum();
          setPreparingBriefing(null);
          setFeedItems((items) => [
            ...items.filter((item) => (
              item.mode !== 'briefing-preparing' &&
              item.generatedAt !== parsed.generatedAt
            )),
            parsed,
          ].slice(-12));
          showNotification();
          sessionStorage.setItem(sessionKey, '1');
          sessionStorage.removeItem('ai_daily_briefing_pending');
          sessionStorage.removeItem('ai_daily_briefing_pending_at');
          setBriefingComplete(true);
          return;
        }
      } catch {
        sessionStorage.removeItem(key);
      }
    }

    briefingInFlightRef.current = true;
    try {
      const result = await handleGenerate('briefing', true, {
        asOfLabel: 'AI Shift Handoff',
        branchLabel,
        managerNickname: managerNickname?.trim() || 'Manager',
        timeOfDayLabel: getTimeOfDayLabel(),
        generatedFor: new Date().toISOString(),
      });
      if (result) {
        sessionStorage.setItem(key, JSON.stringify(result));
        sessionStorage.setItem(sessionKey, '1');
        sessionStorage.removeItem('ai_daily_briefing_pending');
        sessionStorage.removeItem('ai_daily_briefing_pending_at');
      }
    } finally {
      briefingInFlightRef.current = false;
      setBriefingComplete(true);
    }
  }, [branchId, branchLabel, handleGenerate, hasData, managerNickname, showNotification, waitForPreparingBriefingMinimum]);

  const generateLiveReport = useCallback(async (date) => {
    if (!branchId || !hasData || liveReportInFlightRef.current) return;

    const hour = date.getHours();
    if (hour < 7) return;

    const key = getHourlyReportKey(branchId, date);
    const savedReport = localStorage.getItem(key);
    if (savedReport) {
      try {
        const parsed = JSON.parse(savedReport);
        if (parsed?.generatedAt) {
          setFeedItems((items) => (
            items.some((item) => item.generatedAt === parsed.generatedAt)
              ? items
              : [...items, parsed].slice(-12)
          ));
          showNotification();
          return;
        }
      } catch {
        localStorage.removeItem(key);
      }
    }

    liveReportInFlightRef.current = true;
    try {
      const result = await handleGenerate('live', true, {
        asOfLabel: formatAsOfLabel(date),
        scheduledHour: hour,
        generatedFor: date.toISOString(),
      });
      if (result) {
        localStorage.setItem(key, JSON.stringify(result));
      }
    } finally {
      liveReportInFlightRef.current = false;
    }
  }, [branchId, handleGenerate, hasData, showNotification]);

  const analyticsSignature = JSON.stringify({
    summary: analyticsData?.summary || {},
    products: analyticsData?.products || {},
    daily: analyticsData?.daily || {},
    hourly: analyticsData?.hourly || {},
    weekly: analyticsData?.weekly || {},
    monthly: analyticsData?.monthly || {},
    inventory: analyticsData?.inventory || {},
  });

  useEffect(() => {
    if (!branchId) return;

    if (!analyticsSignatureRef.current) {
      analyticsSignatureRef.current = analyticsSignature;
      return;
    }

    if (analyticsSignatureRef.current === analyticsSignature) return;

    analyticsSignatureRef.current = analyticsSignature;
    clearAnalysisCache(branchId);
    sessionStorage.removeItem(getDailyBriefingKey(branchId));
    sessionStorage.removeItem(getDailyBriefingSessionKey(branchId));
    clearStoredLiveFeedCache(branchId);

    if (!notificationOpen || !hasData) {
      setFeedItems([]);
    }
  }, [analyticsSignature, branchId, notificationOpen, hasData]);

  useEffect(() => {
    if (!branchId) return;

    const pendingLoginBriefing = sessionStorage.getItem('ai_daily_briefing_pending') === '1';
    const alreadyShown = sessionStorage.getItem(getDailyBriefingSessionKey(branchId)) === '1';
    const shouldPrepareBriefing = pendingLoginBriefing || !alreadyShown;

    if (shouldPrepareBriefing && !nicknameLoaded) {
      return;
    }

    if (shouldPrepareBriefing) {
      showPreparingBriefing();
    }

    if (!hasData || !inventoryLoaded) return;

    if (!pendingLoginBriefing && alreadyShown) {
      setBriefingComplete(true);
      return;
    }

    const timer = setTimeout(() => {
      generateDailyBriefing();
    }, shouldPrepareBriefing ? PREPARING_BRIEFING_MIN_MS : DAILY_BRIEFING_DELAY_MS);

    return () => clearTimeout(timer);
  }, [branchId, generateDailyBriefing, hasData, inventoryLoaded, nicknameLoaded, showPreparingBriefing]);

  useEffect(() => {
    if (!branchId || !hasData || !briefingComplete) return;

    let hourlyTimer = null;

    function scheduleNextClockHourReport() {
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setHours(now.getHours() + 1, 0, 0, 0);

      hourlyTimer = setTimeout(async () => {
        await generateLiveReport(new Date());
        scheduleNextClockHourReport();
      }, nextHour.getTime() - now.getTime());
    }

    const firstReportTimer = setTimeout(async () => {
      await generateLiveReport(new Date());
      scheduleNextClockHourReport();
    }, FIRST_LIVE_REPORT_DELAY_MS);

    return () => {
      clearTimeout(firstReportTimer);
      if (hourlyTimer) clearTimeout(hourlyTimer);
    };
  }, [branchId, briefingComplete, generateLiveReport, hasData]);

  return (
    <div aria-live="polite">
      <div className={`${styles.chatPanel} ${panelVisible ? styles.open : ''}`}>
        <div className={styles.panelHeader}>
          <div className={styles.panelAvatar}>
            <BotIcon size={18} />
          </div>
          <div className={styles.panelInfo}>
            <p className={styles.panelName}>Live Operations AI</p>
            <p className={styles.panelStatus}>
              <span className={styles.statusDot} />
              {analysis?.mode === 'briefing-preparing' ? 'Preparing shift handoff' : analysis?.mode === 'briefing' ? 'Shift handoff ready' : analysis?.mode === 'live' ? 'AI Live Operations Feed active' : 'Listening for operations changes'}
            </p>
          </div>
          <button
            className={styles.closeBtn}
            onClick={() => {
              setNotificationOpen(false);
              if (notificationTimerRef.current) {
                clearTimeout(notificationTimerRef.current);
                notificationTimerRef.current = null;
              }
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className={styles.chatBody} ref={bodyRef}>
          {!hasData && !analysis && !generating && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <BotIcon size={40} />
              </div>
              <h3 className={styles.emptyTitle}>No Data Yet</h3>
              <p className={styles.emptyText}>
                Once your store starts receiving orders, I will be able to analyze
                your sales performance and give you recommendations.
              </p>
            </div>
          )}

          {hasData && !analysis && !generating && !error && (
            <div className={`${styles.messageBubble} ${styles.system}`}>
              Live Operations AI is ready. Shift handoffs and hourly updates will appear here.
            </div>
          )}

          {generating && analysis?.mode !== 'briefing-preparing' && (
            <div className={styles.loadingDots}>
              <span className={styles.loadingDot} />
              <span className={styles.loadingDot} />
              <span className={styles.loadingDot} />
            </div>
          )}

          {error && !generating && (
            <div className={`${styles.messageBubble} ${styles.ai}`}>
              <p className={styles.aiSectionText} style={{ color: 'var(--color-danger)' }}>
                {error}
              </p>
            </div>
          )}

          {analysis && <AnalysisMessages analysis={analysis} />}
        </div>
      </div>
    </div>
  );
}
