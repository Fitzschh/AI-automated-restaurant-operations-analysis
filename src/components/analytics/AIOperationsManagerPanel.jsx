import { useCallback, useState } from 'react';
import { generateAIAnalysis } from '../../lib/aiAnalystService';
import { BotIcon } from './AnalyticsIcons';

function ConfidenceBadge({ score }) {
  if (score === undefined || score === null || score === '') return null;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      border: '1px solid var(--color-border)',
      borderRadius: 999,
      padding: '4px 10px',
      fontSize: '0.76rem',
      color: 'var(--color-text-secondary)',
      background: 'var(--color-bg-elevated)',
      whiteSpace: 'nowrap',
    }}>
      Confidence {score}%
    </span>
  );
}

function ResultCard({ title, action, loading, children }) {
  return (
    <div style={{
      background: 'var(--color-bg-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      padding: 'var(--space-5)',
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>{title}</h3>
        {action}
      </div>
      {loading ? (
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Analyzing operations...</p>
      ) : children}
    </div>
  );
}

function LeakView({ leak }) {
  if (!leak) {
    return <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Run a leak check to estimate missed revenue.</p>;
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{leak.summary}</p>
          <p style={{ margin: '8px 0 0 0', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            Potential Revenue Lost Today: {leak.potentialRevenueLost || 'Insufficient data'}
          </p>
          <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-muted)', fontSize: '0.86rem' }}>
            Largest Revenue Leak: {leak.largestRevenueLeak || 'Insufficient data'}
          </p>
        </div>
        <ConfidenceBadge score={leak.confidenceScore} />
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {(leak.leaks || []).map((item, index) => (
          <div key={`${item.category}-${index}`} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 14px', background: 'var(--color-bg-elevated)' }}>
            <p style={{ margin: 0, fontWeight: 800, color: 'var(--color-text-primary)' }}>{item.category}</p>
            <p style={{ margin: '6px 0 0 0', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{item.finding}</p>
            <p style={{ margin: '8px 0 0 0', color: 'var(--color-text-muted)', fontSize: '0.84rem' }}>
              Loss: {item.estimatedLoss || 'Insufficient data'} · Action: {item.recommendedAction}
            </p>
          </div>
        ))}
      </div>
      {leak.recommendedAction && (
        <p style={{ margin: 0, color: 'var(--color-text-primary)', fontWeight: 700 }}>Recommended Action: {leak.recommendedAction}</p>
      )}
    </div>
  );
}

export default function AIOperationsManagerPanel({ analyticsData, branchId }) {
  const [leak, setLeak] = useState(null);
  const [loadingMode, setLoadingMode] = useState(null);
  const [error, setError] = useState('');
  const hasData = Number(analyticsData?.summary?.totalOrders || 0) > 0;

  const runAnalysis = useCallback(async (mode, reportContext = {}) => {
    if (!branchId || !hasData || loadingMode) return null;

    setError('');
    setLoadingMode(mode);
    try {
      const result = await generateAIAnalysis(
        { ...analyticsData, reportContext },
        branchId,
        true,
        mode,
      );
      return result;
    } catch (err) {
      setError(err.message || 'AI Operations Manager failed.');
      return null;
    } finally {
      setLoadingMode(null);
    }
  }, [analyticsData, branchId, hasData, loadingMode]);

  async function handleLeakCheck() {
    const result = await runAnalysis('leak', { asOfLabel: 'Revenue leak detector' });
    if (result) setLeak(result);
  }

  return (
    <section style={{ margin: 'var(--space-6) 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
            AI Operations Manager
          </h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)', margin: 'var(--space-1) 0 0 0' }}>
            Scan for hidden revenue loss using the corrected analytics data.
          </p>
        </div>
        <BotIcon size={24} color="var(--color-accent)" />
      </div>

      {error && (
        <div style={{ marginBottom: 'var(--space-4)', padding: '10px 12px', borderRadius: 8, background: 'var(--color-danger-subtle)', color: 'var(--color-danger)', fontSize: '0.88rem', fontWeight: 700 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <ResultCard
          title="Revenue Leak Detector"
          loading={loadingMode === 'leak'}
          action={(
            <button
              onClick={handleLeakCheck}
              disabled={!hasData || Boolean(loadingMode)}
              style={smallButtonStyle}
            >
              Scan Leaks
            </button>
          )}
        >
          <LeakView leak={leak} />
        </ResultCard>
      </div>
    </section>
  );
}

const smallButtonStyle = {
  border: '1px solid rgba(22, 160, 133, 0.28)',
  background: 'rgba(22, 160, 133, 0.1)',
  color: 'var(--color-accent)',
  borderRadius: 8,
  padding: '8px 12px',
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: '0.82rem',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  fontFamily: 'inherit',
};
