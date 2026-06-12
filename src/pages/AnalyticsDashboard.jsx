/**
 * Analytics Dashboard Page
 *
 * Operations Dashboard
 * - Clean KPI overview
 * - Revenue trends with pure SVG charts
 * - Order activity heatmaps
 * - Product performance rankings
 * - Hidden advanced stats
 * - Floating AI chat head (bottom-right)
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import BusinessOverview from '../components/analytics/BusinessOverview';
import RevenueTrends from '../components/analytics/RevenueTrends';
import OrderActivity from '../components/analytics/OrderActivity';
import ProductPerformance from '../components/analytics/ProductPerformance';
import OperationalInsights from '../components/analytics/OperationalInsights';
import AdvancedStats from '../components/analytics/AdvancedStats';
import AIFloatingChat from '../components/analytics/AIFloatingChat';
import { useAnalyticsProcessor } from '../hooks/useAnalyticsProcessor';

import {
  formatDateKey,
  formatWeekKey,
  formatMonthKey,
  onAnalyticsChange,
} from '../lib/analyticsApi';

// Re-using the minimal dashboard loading style
import styles from '../components/analytics/AnalyticsDashboard.module.css';

export default function AnalyticsDashboard() {
  const { branchId } = useParams();
  const { initialLoading } = useAuth();

  // Enable real-time analytics processing for this branch
  useAnalyticsProcessor(branchId, true);

  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);

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
    daily: dashboardData.dailyData,
    hourly: dashboardData.hourlyData,
    weekly: dashboardData.weeklyData,
    monthly: dashboardData.monthlyData,
    statistics: dashboardData.statistics,
    todayAnalytics: dashboardData.todayAnalytics,
    weekAnalytics: dashboardData.weekAnalytics,
    monthAnalytics: dashboardData.monthAnalytics,
  }), [dashboardData]);

  const hasOrders = Number(dashboardData.summary?.totalOrders || 0) > 0;

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
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Analytics</h1>
      </div>

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
          <AdvancedStats statistics={dashboardData.statistics} />
        </>
      )}

      {/* Floating AI Chat Head — always accessible */}
      <AIFloatingChat analyticsData={aiAnalyticsData} branchId={branchId} />
    </DashboardLayout>
  );
}
