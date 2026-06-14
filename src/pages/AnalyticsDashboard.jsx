import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import BusinessOverview from '../components/analytics/BusinessOverview';
import RevenueTrends from '../components/analytics/RevenueTrends';
import OrderActivity from '../components/analytics/OrderActivity';
import ProductPerformance from '../components/analytics/ProductPerformance';
import OperationalInsights from '../components/analytics/OperationalInsights';
import AdvancedStats from '../components/analytics/AdvancedStats';
import AIOperationsManagerPanel from '../components/analytics/AIOperationsManagerPanel';
import { useAnalyticsProcessor } from '../hooks/useAnalyticsProcessor';
import { generateAIAnalysis } from '../lib/aiAnalystService';
import { BotIcon, ClipboardIcon } from '../components/analytics/AnalyticsIcons';

import {
  formatDateKey,
  formatWeekKey,
  formatMonthKey,
  onAnalyticsChange,
} from '../lib/analyticsApi';
import { onMenuAndInventoryChange } from '../lib/inventoryApi';

import styles from '../components/analytics/AnalyticsDashboard.module.css';

function QuickAnalysisResult({ result }) {
  if (!result) return null;

  const insight = result.insight || result.notifications?.[0];
  const message = insight?.message || [insight?.whatHappened, insight?.whyItMatters].filter(Boolean).join(' ');
  const action = insight?.action || insight?.recommendedAction;

  return (
    <section style={aiResultStyle}>
      <div style={aiResultHeaderStyle}>
        <BotIcon size={18} color="var(--color-accent)" />
        <h2 style={aiResultTitleStyle}>Quick Analysis</h2>
      </div>
      <p style={aiResultTextStyle}>{message || result.overallHealth || 'AI analysis completed.'}</p>
      {action && (
        <p style={aiActionStyle}><strong>Recommended action:</strong> {action}</p>
      )}
    </section>
  );
}

function ListBlock({ title, items }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <p style={blockTitleStyle}>{title}</p>
      <ul style={listStyle}>
        {items.map((item, index) => (
          <li key={`${title}-${index}`} style={listItemStyle}>
            <span style={dotStyle} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeepAnalysisResult({ result }) {
  if (!result) return null;

  const sections = [
    ['Revenue Analysis', result.revenuePerformance],
    ['Product Analysis', result.productPerformance],
    ['Inventory Analysis', result.inventoryAnalysis],
    ['Peak Hour & Staffing', result.peakHourAnalysis],
    ['Staffing Recommendations', result.staffingRecommendations],
    ['Revenue Leak Detection', result.revenueLeakDetection],
    ['Forecasting', result.forecasting],
  ];

  return (
    <section style={deepResultStyle}>
      <div style={aiResultHeaderStyle}>
        <BotIcon size={18} color="var(--color-accent)" />
        <div>
          <h2 style={aiResultTitleStyle}>AI Executive Business Analysis</h2>
          <p style={smallMutedStyle}>End-of-shift, end-of-day, weekly, or monthly review report.</p>
        </div>
      </div>

      <div style={deepGridStyle}>
        {sections.map(([title, data]) => (
          <div key={title} style={deepCardStyle}>
            <h3 style={deepCardTitleStyle}>{title}</h3>
            <p style={aiResultTextStyle}>{data?.summary || 'No significant finding for this section yet.'}</p>
            <ListBlock title="Key Points" items={data?.insights || data?.recommendations || data?.stockOutRisks || data?.topSelling || data?.leaks || data?.risks || data?.opportunities} />
          </div>
        ))}
      </div>

      {result.operationalRecommendations && (
        <div style={deepCardStyle}>
          <h3 style={deepCardTitleStyle}>Operational Recommendations</h3>
          <ListBlock title="High Priority" items={result.operationalRecommendations.high} />
          <ListBlock title="Medium Priority" items={result.operationalRecommendations.medium} />
          <ListBlock title="Low Priority" items={result.operationalRecommendations.low} />
        </div>
      )}

      {result.executiveSummary && (
        <p style={aiActionStyle}><strong>Executive summary:</strong> {result.executiveSummary}</p>
      )}
    </section>
  );
}

export default function AnalyticsDashboard() {
  const { branchId } = useParams();
  const navigate = useNavigate();
  const { initialLoading } = useAuth();

  useAnalyticsProcessor(branchId, true);

  const [analyticsData, setAnalyticsData] = useState(null);
  const [inventoryData, setInventoryData] = useState({});
  const [loading, setLoading] = useState(true);
  const [quickResult, setQuickResult] = useState(null);
  const [deepResult, setDeepResult] = useState(null);
  const [aiLoadingMode, setAiLoadingMode] = useState('');
  const [aiError, setAiError] = useState('');

  const currentKeys = useMemo(() => {
    const now = new Date();
    return {
      today: formatDateKey(now),
      week: formatWeekKey(now),
      month: formatMonthKey(now),
    };
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;

    setLoading(true);
    setAnalyticsData(null);

    const unsubscribe = onAnalyticsChange(branchId, (data) => {
      setAnalyticsData(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    return onMenuAndInventoryChange(branchId, setInventoryData);
  }, [branchId]);

  const dashboardData = useMemo(() => {
    const summary = analyticsData?.summary || {};
    const products = analyticsData?.products || {};
    const dailyData = analyticsData?.daily || {};
    const weeklyData = analyticsData?.weekly || {};
    const monthlyData = analyticsData?.monthly || {};
    const statistics = analyticsData?.statistics || {};
    const hourlyData = analyticsData?.hourly?.[currentKeys.today] || {};

    return {
      summary,
      products,
      dailyData,
      hourlyData,
      weeklyData,
      monthlyData,
      statistics,
      todayAnalytics: dailyData?.[currentKeys.today] || { orders: 0, revenue: 0, averageOrderValue: 0 },
      weekAnalytics: weeklyData?.[currentKeys.week] || { orders: 0, revenue: 0 },
      monthAnalytics: monthlyData?.[currentKeys.month] || { orders: 0, revenue: 0 },
    };
  }, [analyticsData, currentKeys]);

  const aiAnalyticsData = useMemo(() => ({
    summary: dashboardData.summary,
    products: dashboardData.products,
    inventory: inventoryData,
    daily: dashboardData.dailyData,
    hourly: analyticsData?.hourly || {},
    weekly: dashboardData.weeklyData,
    monthly: dashboardData.monthlyData,
    statistics: dashboardData.statistics,
    todayAnalytics: dashboardData.todayAnalytics,
    weekAnalytics: dashboardData.weekAnalytics,
    monthAnalytics: dashboardData.monthAnalytics,
  }), [analyticsData, dashboardData, inventoryData]);

  const hasOrders = Number(dashboardData.summary?.totalOrders || 0) > 0;

  async function handleQuickAnalysis() {
    if (!hasOrders || aiLoadingMode) return;
    setAiError('');
    setAiLoadingMode('quick');
    try {
      const result = await generateAIAnalysis(aiAnalyticsData, branchId, true, 'realtime');
      setQuickResult(result);
    } catch (error) {
      setAiError(error.message || 'Quick analysis failed.');
    } finally {
      setAiLoadingMode('');
    }
  }

  async function handleDeepAnalysis() {
    if (!hasOrders || aiLoadingMode) return;
    setAiError('');
    setAiLoadingMode('deep');
    try {
      const result = await generateAIAnalysis(aiAnalyticsData, branchId, true, 'deep');
      setDeepResult(result);
    } catch (error) {
      setAiError(error.message || 'Deep analysis failed.');
    } finally {
      setAiLoadingMode('');
    }
  }

  if (initialLoading || loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--color-bg-primary)', color: 'var(--color-text-muted)' }}>
        <div className={styles.spinner}></div>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>Loading analytics...</p>
      </div>
    );
  }

  return (
    <DashboardLayout branchId={branchId}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Analytics</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleQuickAnalysis}
            disabled={!hasOrders || Boolean(aiLoadingMode)}
            style={primaryButtonStyle}
          >
            <BotIcon size={16} />
            {aiLoadingMode === 'quick' ? 'Analyzing...' : 'Quick Analysis'}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/analytics-history/${branchId}`)}
            style={secondaryButtonStyle}
          >
            <ClipboardIcon size={16} />
            Analytics History
          </button>
        </div>
      </div>

      {aiError && (
        <div style={errorStyle}>{aiError}</div>
      )}

      <QuickAnalysisResult result={quickResult} />

      {!hasOrders ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--color-bg-card)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--color-border)' }}>
          <h2 style={{ fontSize: '1.2rem', color: 'var(--color-text-primary)', marginBottom: '8px' }}>No Data Available</h2>
          <p style={{ color: 'var(--color-text-muted)' }}>There are no completed orders for this branch yet. Once your tablet starts sending orders, analytics will populate automatically.</p>
        </div>
      ) : (
        <>
          <BusinessOverview summary={dashboardData.summary} />
          <RevenueTrends dailyData={dashboardData.dailyData} monthlyData={dashboardData.monthlyData} />
          <OrderActivity hourlyData={dashboardData.hourlyData} dailyData={dashboardData.dailyData} />
          <ProductPerformance products={dashboardData.products} />
          <OperationalInsights />
          <AIOperationsManagerPanel analyticsData={aiAnalyticsData} branchId={branchId} />
          <AdvancedStats statistics={dashboardData.statistics} />
          <section style={deepControlStyle}>
            <div>
              <h2 style={{ fontSize: '1.2rem', color: 'var(--color-text-primary)', margin: 0 }}>Executive Business Analysis</h2>
              <p style={smallMutedStyle}>Generate a comprehensive AI report for end-of-day, shift, weekly, or monthly review.</p>
            </div>
            <button
              type="button"
              onClick={handleDeepAnalysis}
              disabled={!hasOrders || Boolean(aiLoadingMode)}
              style={primaryButtonStyle}
            >
              <BotIcon size={16} />
              {aiLoadingMode === 'deep' ? 'Building Report...' : 'Deep Analysis'}
            </button>
          </section>
          <DeepAnalysisResult result={deepResult} />
        </>
      )}
    </DashboardLayout>
  );
}

const primaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  border: '1px solid rgba(22, 160, 133, 0.28)',
  background: 'var(--color-accent)',
  color: '#fff',
  borderRadius: 8,
  padding: '10px 14px',
  fontWeight: 800,
  fontSize: '0.86rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: 'var(--color-bg-card)',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border)',
};

const errorStyle = {
  marginBottom: 'var(--space-4)',
  padding: '10px 12px',
  borderRadius: 8,
  background: 'var(--color-danger-subtle)',
  color: 'var(--color-danger)',
  fontSize: '0.88rem',
  fontWeight: 700,
};

const aiResultStyle = {
  background: 'var(--color-bg-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: 'var(--space-5)',
  marginBottom: 'var(--space-5)',
};

const deepResultStyle = {
  ...aiResultStyle,
  display: 'grid',
  gap: 'var(--space-4)',
};

const aiResultHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 'var(--space-3)',
};

const aiResultTitleStyle = {
  fontSize: '1rem',
  color: 'var(--color-text-primary)',
  margin: 0,
};

const aiResultTextStyle = {
  color: 'var(--color-text-secondary)',
  margin: 0,
  lineHeight: 1.6,
};

const aiActionStyle = {
  color: 'var(--color-text-secondary)',
  margin: 'var(--space-3) 0 0 0',
  lineHeight: 1.6,
};

const smallMutedStyle = {
  color: 'var(--color-text-muted)',
  margin: '4px 0 0 0',
  fontSize: '0.86rem',
};

const deepControlStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  background: 'var(--color-bg-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: 'var(--space-5)',
  margin: 'var(--space-6) 0 var(--space-4) 0',
};

const deepGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
  gap: 'var(--space-4)',
};

const deepCardStyle = {
  background: 'var(--color-bg-elevated)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: 'var(--space-4)',
};

const deepCardTitleStyle = {
  fontSize: '0.95rem',
  color: 'var(--color-text-primary)',
  margin: '0 0 var(--space-2) 0',
};

const blockTitleStyle = {
  margin: 'var(--space-3) 0 0 0',
  fontSize: '0.76rem',
  color: 'var(--color-accent)',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: 0,
};

const listStyle = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 6,
};

const listItemStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  color: 'var(--color-text-secondary)',
  fontSize: '0.86rem',
  lineHeight: 1.5,
};

const dotStyle = {
  width: 5,
  height: 5,
  borderRadius: '50%',
  background: 'var(--color-accent)',
  flexShrink: 0,
  marginTop: 8,
};
