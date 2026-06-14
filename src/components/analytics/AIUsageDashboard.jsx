import { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '../../lib/firebase';

const SERVICE_LABELS = {
  liveOperationsFeed: 'AI Live Operations Feed Usage',
  executiveBusinessAnalysis: 'AI Executive Business Analysis Usage',
  advancedOperationsManager: 'AI Operations Manager Usage',
};

function getPeriodKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function numberValue(value) {
  return Number(value || 0);
}

function formatTokens(value) {
  return new Intl.NumberFormat('en-US').format(Math.round(numberValue(value)));
}

function formatCost(value) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(numberValue(value));
}

function serviceMetrics(usage, service) {
  const data = usage?.services?.[service] || {};
  const requests = numberValue(data.requests);
  const totalTokens = numberValue(data.totalTokens);

  return {
    requests,
    promptTokens: numberValue(data.promptTokens),
    completionTokens: numberValue(data.completionTokens),
    totalTokens,
    averageTokens: requests > 0 ? Math.round(totalTokens / requests) : 0,
    estimatedCostPhp: numberValue(data.estimatedCostPhp),
  };
}

function combineMetrics(items) {
  return items.reduce((total, item) => ({
    requests: total.requests + item.requests,
    promptTokens: total.promptTokens + item.promptTokens,
    completionTokens: total.completionTokens + item.completionTokens,
    totalTokens: total.totalTokens + item.totalTokens,
    estimatedCostPhp: total.estimatedCostPhp + item.estimatedCostPhp,
  }), {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostPhp: 0,
  });
}

function periodRows(group = {}) {
  return Object.entries(group)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, services]) => ({
      label,
      totalTokens: Object.values(services || {}).reduce(
        (sum, data) => sum + numberValue(data?.totalTokens),
        0,
      ),
    }));
}

function usageForTrigger(usage, trigger, service) {
  return numberValue(usage?.triggers?.[trigger]?.[service]?.requests);
}

function StatCard({ label, value, detail }) {
  return (
    <div style={{
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: '8px',
      padding: 'var(--space-4)',
      minWidth: 0,
    }}>
      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0 }}>
        {label}
      </p>
      <p style={{ margin: 'var(--space-2) 0 var(--space-1) 0', fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
        {value}
      </p>
      {detail && (
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
          {detail}
        </p>
      )}
    </div>
  );
}

function UsageBar({ label, metrics, share, detail }) {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'baseline', marginBottom: 'var(--space-2)' }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--color-text-primary)' }}>{label}</p>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{detail}</p>
        </div>
        <p style={{ margin: 0, fontWeight: 800, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
          {formatTokens(metrics.totalTokens)} Tokens
        </p>
      </div>
      <div style={{ height: 9, borderRadius: 999, overflow: 'hidden', background: 'var(--color-bg-input)' }}>
        <div style={{
          width: `${Math.max(3, share)}%`,
          height: '100%',
          background: 'linear-gradient(90deg, var(--color-accent), var(--color-success))',
        }} />
      </div>
      <p style={{ margin: 'var(--space-2) 0 0 0', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
        {metrics.requests} requests · Avg {formatTokens(metrics.averageTokens)} tokens/report · {formatCost(metrics.estimatedCostPhp)}
      </p>
    </div>
  );
}

function TrendBlock({ title, rows }) {
  const visibleRows = rows.slice(-8);
  const maxTokens = Math.max(...visibleRows.map((row) => row.totalTokens), 1);

  return (
    <div style={{ minWidth: 0 }}>
      <h4 style={{ margin: '0 0 var(--space-3) 0', fontSize: '0.92rem', color: 'var(--color-text-primary)' }}>
        {title}
      </h4>
      {visibleRows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No usage recorded yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {visibleRows.map((row) => (
            <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '86px 1fr auto', gap: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {row.label}
              </span>
              <div style={{ height: 7, borderRadius: 999, background: 'var(--color-bg-input)', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.max(4, (row.totalTokens / maxTokens) * 100)}%`,
                  height: '100%',
                  background: 'var(--color-accent)',
                }} />
              </div>
              <strong style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                {formatTokens(row.totalTokens)}
              </strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AIUsageDashboard({ branchId, branchName }) {
  const [period] = useState(() => getPeriodKey());
  const [usage, setUsage] = useState({});
  const [loading, setLoading] = useState(Boolean(branchId));

  useEffect(() => {
    if (!branchId) return undefined;

    setLoading(true);
    const usageRef = ref(database, `${branchId}/aiUsage/${period}`);
    return onValue(usageRef, (snapshot) => {
      setUsage(snapshot.val() || {});
      setLoading(false);
    }, () => {
      setUsage({});
      setLoading(false);
    });
  }, [branchId, period]);

  const metrics = useMemo(() => {
    const live = serviceMetrics(usage, 'liveOperationsFeed');
    const executive = serviceMetrics(usage, 'executiveBusinessAnalysis');
    const operations = serviceMetrics(usage, 'advancedOperationsManager');
    const total = combineMetrics([live, executive, operations]);
    total.averageTokens = total.requests > 0 ? Math.round(total.totalTokens / total.requests) : 0;

    return { live, executive, operations, total };
  }, [usage]);

  const trends = useMemo(() => ({
    daily: periodRows(usage.daily),
    weekly: periodRows(usage.weekly),
    monthly: periodRows(usage.monthly),
  }), [usage]);

  const costDetail = `${metrics.total.requests} AI requests · Avg ${formatTokens(metrics.total.averageTokens)} tokens/request`;

  const cardStyle = {
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: 'var(--space-5)',
    marginBottom: 'var(--space-4)',
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', alignItems: 'flex-start', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
            AI Usage & Cost Monitoring
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 'var(--space-1) 0 0 0' }}>
            Current billing period: {period}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
        <StatCard label="Total AI Usage" value={`${formatTokens(metrics.total.totalTokens)} Tokens`} detail={loading ? 'Loading latest usage...' : costDetail} />
        <StatCard label="Estimated Cost" value={formatCost(metrics.total.estimatedCostPhp)} detail="OpenAI usage estimate for this branch" />
        <StatCard label="Branch" value={branchName || branchId} detail="Branch-level cost attribution" />
      </div>

      <div style={{ marginBottom: 'var(--space-5)' }}>
        <UsageBar
          label={SERVICE_LABELS.liveOperationsFeed}
          metrics={metrics.live}
          share={metrics.total.totalTokens ? (metrics.live.totalTokens / metrics.total.totalTokens) * 100 : 0}
          detail={`${usageForTrigger(usage, 'hourly', 'liveOperationsFeed')} hourly reports · ${usageForTrigger(usage, 'manual', 'liveOperationsFeed')} manual quick insights`}
        />
        <UsageBar
          label={SERVICE_LABELS.executiveBusinessAnalysis}
          metrics={metrics.executive}
          share={metrics.total.totalTokens ? (metrics.executive.totalTokens / metrics.total.totalTokens) * 100 : 0}
          detail={`${metrics.executive.requests} executive reports generated`}
        />
        <UsageBar
          label={SERVICE_LABELS.advancedOperationsManager}
          metrics={metrics.operations}
          share={metrics.total.totalTokens ? (metrics.operations.totalTokens / metrics.total.totalTokens) * 100 : 0}
          detail={`${usageForTrigger(usage, 'briefing', 'advancedOperationsManager')} shift handoffs · ${usageForTrigger(usage, 'leak', 'advancedOperationsManager')} leak checks · ${usageForTrigger(usage, 'opschat', 'advancedOperationsManager')} work chats`}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 'var(--space-5)' }}>
        <TrendBlock title="Daily Token Usage" rows={trends.daily} />
        <TrendBlock title="Weekly Token Usage" rows={trends.weekly} />
        <TrendBlock title="Monthly Token Usage" rows={trends.monthly} />
      </div>
    </div>
  );
}
