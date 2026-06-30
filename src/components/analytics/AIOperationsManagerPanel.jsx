import { useCallback, useState, useEffect, useRef } from 'react';
import { generateAIAnalysis } from '../../lib/aiAnalystService';
import { BotIcon } from './AnalyticsIcons';
import { computeDepletionPredictions } from '../../lib/agents/liveOperationsAnalyst';
import { processAnalystOutput, getActionableAssessments, getNotificationAssessments, applyDecision } from '../../lib/agents/operationsManagerAgent';
import { Severity, Decision } from '../../lib/agents/agentEventSchemas';
import { postEvent, postManagerDecision } from '../../lib/eventGatewayClient';

// ─── Sub-Components ─────────────────────────────────────────────────────────

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

function SeverityBadge({ severity }) {
  const colors = {
    [Severity.HIGH]: { bg: 'rgba(231, 76, 60, 0.12)', color: '#e74c3c', border: 'rgba(231, 76, 60, 0.3)' },
    [Severity.MEDIUM]: { bg: 'rgba(243, 156, 18, 0.12)', color: '#f39c12', border: 'rgba(243, 156, 18, 0.3)' },
    [Severity.LOW]: { bg: 'rgba(22, 160, 133, 0.12)', color: '#16a085', border: 'rgba(22, 160, 133, 0.3)' },
  };

  const style = colors[severity] || colors[Severity.LOW];

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 10px',
      borderRadius: 6,
      fontSize: '0.72rem',
      fontWeight: 800,
      letterSpacing: '0.5px',
      color: style.color,
      background: style.bg,
      border: `1px solid ${style.border}`,
      textTransform: 'uppercase',
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: style.color,
        animation: severity === Severity.HIGH ? 'pulse 1.5s ease-in-out infinite' : 'none',
      }} />
      {severity}
    </span>
  );
}

function DecisionBadge({ decision }) {
  if (!decision || decision === Decision.PENDING) return null;

  const isApproved = decision === Decision.APPROVED;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 10px',
      borderRadius: 6,
      fontSize: '0.72rem',
      fontWeight: 800,
      letterSpacing: '0.5px',
      color: isApproved ? '#27ae60' : '#e74c3c',
      background: isApproved ? 'rgba(39, 174, 96, 0.12)' : 'rgba(231, 76, 60, 0.12)',
      border: `1px solid ${isApproved ? 'rgba(39, 174, 96, 0.3)' : 'rgba(231, 76, 60, 0.3)'}`,
      textTransform: 'uppercase',
    }}>
      {isApproved ? '✓' : '✕'} {decision}
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

// ─── Assessment Card ────────────────────────────────────────────────────────

function AssessmentCard({ assessment, onDecision, deciding }) {
  const isHigh = assessment.severity === Severity.HIGH;
  const isPending = !assessment.decision || assessment.decision === Decision.PENDING;
  const showButtons = isHigh && assessment.approvalRequired && isPending;

  const borderColor = isHigh
    ? 'rgba(231, 76, 60, 0.3)'
    : assessment.severity === Severity.MEDIUM
      ? 'rgba(243, 156, 18, 0.2)'
      : 'var(--color-border)';

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: 8,
      padding: '14px 16px',
      background: isHigh ? 'rgba(231, 76, 60, 0.04)' : 'var(--color-bg-elevated)',
      transition: 'all 0.2s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <SeverityBadge severity={assessment.severity} />
            {assessment.decision && <DecisionBadge decision={assessment.decision} />}
          </div>
          <p style={{ margin: '6px 0 0 0', fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-text-primary)' }}>
            {assessment.issue}
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Stock</p>
          <p style={{ margin: '2px 0 0 0', fontWeight: 800, fontSize: '1rem', color: 'var(--color-text-primary)' }}>
            {assessment.currentStock}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: assessment.actionPlan ? 10 : 0 }}>
        <span>Velocity: {assessment.salesVelocityPerHour} units/hr</span>
        <span>Remaining: {assessment.hoursRemaining < 999 ? `${assessment.hoursRemaining} hrs` : 'Stable'}</span>
      </div>

      {assessment.actionPlan && (
        <div style={{
          padding: '10px 12px',
          borderRadius: 6,
          background: isHigh ? 'rgba(231, 76, 60, 0.08)' : 'var(--color-bg-primary)',
          border: `1px solid ${isHigh ? 'rgba(231, 76, 60, 0.15)' : 'var(--color-border)'}`,
          marginBottom: showButtons ? 10 : 0,
        }}>
          <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Action Plan: {assessment.actionPlan}
          </p>
        </div>
      )}

      {showButtons && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => onDecision(assessment.itemKey, Decision.APPROVED)}
            disabled={deciding}
            style={{
              ...approvalButtonBase,
              background: 'rgba(39, 174, 96, 0.12)',
              color: '#27ae60',
              border: '1px solid rgba(39, 174, 96, 0.3)',
            }}
          >
            ✓ Accept
          </button>
          <button
            onClick={() => onDecision(assessment.itemKey, Decision.REJECTED)}
            disabled={deciding}
            style={{
              ...approvalButtonBase,
              background: 'rgba(231, 76, 60, 0.12)',
              color: '#e74c3c',
              border: '1px solid rgba(231, 76, 60, 0.3)',
            }}
          >
            ✕ Reject
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Leak View (preserved from original) ────────────────────────────────────

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

// ─── Performance Summary ────────────────────────────────────────────────────

function PerformanceSummary({ managerOutput }) {
  if (!managerOutput) return null;

  const revenue = managerOutput.revenueAnalysis || {};
  const perf = managerOutput.operationalPerformance || {};

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 10,
      marginBottom: 'var(--space-4)',
    }}>
      {[
        { label: 'Today Revenue', value: `₱${(revenue.todayRevenue || 0).toLocaleString()}` },
        { label: 'Today Orders', value: revenue.todayOrders || 0 },
        { label: 'Avg Order Value', value: `₱${(revenue.averageOrderValue || 0).toFixed(0)}` },
        { label: 'Projected Daily', value: `₱${(revenue.projectedDailyRevenue || 0).toLocaleString()}` },
        { label: 'Inventory Health', value: `${perf.inventoryHealthScore || 0}%` },
        { label: 'Action Plans', value: perf.actionPlansGenerated || 0 },
      ].map(({ label, value }) => (
        <div key={label} style={{
          padding: '10px 12px',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          textAlign: 'center',
        }}>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</p>
          <p style={{ margin: '4px 0 0 0', fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export default function AIOperationsManagerPanel({ analyticsData, branchId }) {
  const [leak, setLeak] = useState(null);
  const [managerOutput, setManagerOutput] = useState(null);
  const [loadingMode, setLoadingMode] = useState(null);
  const [error, setError] = useState('');
  const [deciding, setDeciding] = useState(false);
  const prevAnalyticsRef = useRef(null);

  const hasData = Number(analyticsData?.summary?.totalOrders || 0) > 0;
  const inventoryData = analyticsData?.inventory || {};
  const products = analyticsData?.products || {};
  const hourlyData = analyticsData?.hourly || {};
  const dailyData = analyticsData?.daily || {};

  // Run the agent pipeline whenever analytics data changes
  useEffect(() => {
    if (!hasData || !branchId) return;

    const signature = JSON.stringify({
      inv: Object.keys(inventoryData).length,
      prod: Object.keys(products).length,
      totalOrders: analyticsData?.summary?.totalOrders,
    });

    if (prevAnalyticsRef.current === signature) return;
    prevAnalyticsRef.current = signature;

    const analystOutput = computeDepletionPredictions(
      inventoryData, products, hourlyData, dailyData, branchId
    );
    const result = processAnalystOutput(analystOutput, analyticsData);
    setManagerOutput(result);

    // Fire-and-forget: dispatch to event gateway
    postEvent(analystOutput).catch(() => {});
    postEvent(result).catch(() => {});
  }, [hasData, branchId, inventoryData, products, hourlyData, dailyData, analyticsData]);

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

  async function handleDecision(itemKey, decision) {
    if (deciding) return;
    setDeciding(true);

    try {
      // Update local state
      setManagerOutput((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          assessments: prev.assessments.map((a) =>
            a.itemKey === itemKey
              ? applyDecision(a, decision, 'manager')
              : a
          ),
        };
      });

      // Dispatch to event gateway (two-tier: manager decision)
      await postManagerDecision({
        branchId,
        itemKey,
        decision,
        decidedBy: 'manager',
      });
    } catch (err) {
      console.error('[Operations Manager] Decision dispatch failed:', err);
    } finally {
      setDeciding(false);
    }
  }

  // Split assessments by severity
  const actionable = managerOutput ? getActionableAssessments(managerOutput) : [];
  const notifications = managerOutput ? getNotificationAssessments(managerOutput) : [];
  const highCount = actionable.length;
  const mediumCount = notifications.filter((a) => a.severity === Severity.MEDIUM).length;

  return (
    <section style={{ margin: 'var(--space-6) 0' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
            AI Operations Manager
          </h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)', margin: 'var(--space-1) 0 0 0' }}>
            Inventory severity analysis, action plans, and revenue leak detection.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {highCount > 0 && (
            <span style={{
              padding: '4px 10px',
              borderRadius: 12,
              fontSize: '0.76rem',
              fontWeight: 800,
              color: '#e74c3c',
              background: 'rgba(231, 76, 60, 0.12)',
            }}>
              {highCount} Action{highCount !== 1 ? 's' : ''} Required
            </span>
          )}
          <BotIcon size={24} color="var(--color-accent)" />
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 'var(--space-4)', padding: '10px 12px', borderRadius: 8, background: 'var(--color-danger-subtle)', color: 'var(--color-danger)', fontSize: '0.88rem', fontWeight: 700 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {/* Performance Summary */}
        {managerOutput && <PerformanceSummary managerOutput={managerOutput} />}

        {/* HIGH Severity — Action Plans */}
        {actionable.length > 0 && (
          <ResultCard title="Action Plans Required" loading={false}>
            <div style={{ display: 'grid', gap: 10 }}>
              {actionable.map((assessment) => (
                <AssessmentCard
                  key={assessment.itemKey}
                  assessment={assessment}
                  onDecision={handleDecision}
                  deciding={deciding}
                />
              ))}
            </div>
          </ResultCard>
        )}

        {/* MEDIUM & LOW Severity — Notifications Only */}
        {notifications.length > 0 && (
          <ResultCard
            title={`Inventory Status (${notifications.length} items)`}
            loading={false}
          >
            <div style={{ display: 'grid', gap: 8 }}>
              {notifications.slice(0, 8).map((assessment) => (
                <AssessmentCard
                  key={assessment.itemKey}
                  assessment={assessment}
                  onDecision={handleDecision}
                  deciding={deciding}
                />
              ))}
              {notifications.length > 8 && (
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                  +{notifications.length - 8} more items at normal levels
                </p>
              )}
            </div>
          </ResultCard>
        )}

        {/* No assessments fallback */}
        {managerOutput && actionable.length === 0 && notifications.length === 0 && (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            color: 'var(--color-text-muted)',
            fontSize: '0.9rem',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
          }}>
            All inventory levels are within normal operating parameters.
          </div>
        )}

        {/* Revenue Leak Detector */}
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

// ─── Styles ─────────────────────────────────────────────────────────────────

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

const approvalButtonBase = {
  padding: '7px 14px',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: '0.78rem',
  fontFamily: 'inherit',
  transition: 'all 0.15s ease',
};
