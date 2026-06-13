import { useState, useCallback, useRef, useEffect } from 'react';
import { generateAIAnalysis, clearAnalysisCache } from '../../lib/aiAnalystService';
import { BrainIcon, RefreshIcon } from './AnalyticsIcons';
import styles from './AIFloatingChat.module.css';

function AnalysisMessages({ analysis }) {
  if (!analysis) return null;

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

export default function AIFloatingChat({ analyticsData, branchId }) {
  const [open, setOpen] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [hasAutoTriggered, setHasAutoTriggered] = useState(false);
  const bodyRef = useRef(null);
  const analyticsSignatureRef = useRef('');

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [analysis, generating]);

  const handleGenerate = useCallback(async (forceRefresh = false) => {
    if (generating) return;
    setGenerating(true);
    setError(null);

    try {
      if (forceRefresh) {
        clearAnalysisCache(branchId);
      }
      const result = await generateAIAnalysis(analyticsData, branchId, forceRefresh);
      setAnalysis(result);
    } catch (err) {
      console.error('[AI Chat] Generation failed:', err);
      setError(err.message || 'Analysis failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }, [analyticsData, branchId, generating]);

  const handleToggle = useCallback(() => {
    const willOpen = !open;
    setOpen(willOpen);

    if (willOpen && !analysis && !hasAutoTriggered && !generating) {
      setHasAutoTriggered(true);
      setTimeout(() => handleGenerate(false), 300);
    }
  }, [open, analysis, hasAutoTriggered, generating, handleGenerate]);

  const hasData = analyticsData?.summary?.totalOrders > 0;
  const analyticsSignature = JSON.stringify({
    summary: analyticsData?.summary || {},
    products: analyticsData?.products || {},
    daily: analyticsData?.daily || {},
    hourly: analyticsData?.hourly || {},
    weekly: analyticsData?.weekly || {},
    monthly: analyticsData?.monthly || {},
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
    setHasAutoTriggered(false);

    if (open && analysis && hasData && !generating) {
      handleGenerate(true);
    } else if (!open || !hasData) {
      setAnalysis(null);
    }
  }, [analyticsSignature, branchId, open, analysis, hasData, generating, handleGenerate]);

  return (
    <>
      <button
        className={`${styles.chatHead} ${open ? styles.active : ''}`}
        onClick={handleToggle}
        aria-label={open ? 'Close AI Analyst' : 'Open AI Analyst'}
        title="AI Operations Analyst"
      >
        <BrainIcon size={24} />
      </button>

      <div className={`${styles.chatPanel} ${open ? styles.open : ''}`}>
        <div className={styles.panelHeader}>
          <div className={styles.panelAvatar}>
            <BrainIcon size={18} />
          </div>
          <div className={styles.panelInfo}>
            <p className={styles.panelName}>AI Operations Analyst</p>
            <p className={styles.panelStatus}>
              <span className={styles.statusDot} />
              Ready to help
            </p>
          </div>
          <button className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.chatBody} ref={bodyRef}>
          {!hasData && !analysis && !generating && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <BrainIcon size={40} />
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
              Tap the button below to get your operations report.
            </div>
          )}

          {generating && (
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

          {analysis && !generating && (
            <AnalysisMessages analysis={analysis} />
          )}
        </div>

        {hasData && (
          <div className={styles.panelFooter}>
            <button
              className={styles.refreshBtn}
              onClick={() => handleGenerate(analysis !== null)}
              disabled={generating}
            >
              <span className={`${styles.refreshIcon} ${generating ? styles.spinning : ''}`}>
                <RefreshIcon size={14} />
              </span>
              {generating ? 'Analyzing...' : analysis ? 'Refresh Analysis' : 'Analyze Now'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
