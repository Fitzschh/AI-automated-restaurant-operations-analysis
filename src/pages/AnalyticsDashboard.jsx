/**
 * Analytics Dashboard Page
 * 
 * Redesigned Operations Dashboard
 * - Clean KPI overview
 * - Revenue trends with pure SVG charts
 * - Order activity heatmaps
 * - Product performance rankings
 * - Hidden advanced stats
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import BusinessOverview from '../components/analytics/BusinessOverview';
import RevenueTrends from '../components/analytics/RevenueTrends';
import OrderActivity from '../components/analytics/OrderActivity';
import ProductPerformance from '../components/analytics/ProductPerformance';
import OperationalInsights from '../components/analytics/OperationalInsights';
import AdvancedStats from '../components/analytics/AdvancedStats';
import AIAnalystPanel from '../components/analytics/AIAnalystPanel';
import SeedDataButton from '../components/analytics/SeedDataButton';

import {
  getAnalyticsSummary,
  getProductsAnalytics,
  getDailyAnalytics,
  getHourlyAnalytics,
  getMonthlyAnalytics,
  getWeeklyAnalytics,
  getStatistics,
  getTodayAnalytics,
  getCurrentWeekAnalytics,
  getCurrentMonthAnalytics,
  formatDateKey,
  onAnalyticsSummaryChange,
  onProductsAnalyticsChange,
  onDailyAnalyticsChange,
} from '../lib/analyticsApi';

// Re-using the minimal dashboard loading style
import styles from '../components/analytics/AnalyticsDashboard.module.css';

export default function AnalyticsDashboard() {
  const { branchId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, initialLoading } = useAuth();

  // Data states
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState({});
  const [dailyData, setDailyData] = useState({});
  const [hourlyData, setHourlyData] = useState({});
  const [monthlyData, setMonthlyData] = useState({});
  const [weeklyData, setWeeklyData] = useState({});
  const [statistics, setStatistics] = useState(null);
  
  // Need these for the AI Analyst prompt
  const [todayAnalytics, setTodayAnalytics] = useState({});
  const [weekAnalytics, setWeekAnalytics] = useState({});
  const [monthAnalytics, setMonthAnalytics] = useState({});

  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!branchId) return;

    let unsubscribes = [];

    const fetchData = async () => {
      try {
        setLoading(true);

        const [
          summaryData, productsData, daily, stats, weekly, monthly,
          today, week, month
        ] = await Promise.all([
          getAnalyticsSummary(branchId),
          getProductsAnalytics(branchId),
          getDailyAnalytics(branchId),
          getStatistics(branchId),
          getWeeklyAnalytics(branchId),
          getMonthlyAnalytics(branchId),
          getTodayAnalytics(branchId),
          getCurrentWeekAnalytics(branchId),
          getCurrentMonthAnalytics(branchId),
        ]);

        setSummary(summaryData || {});
        setProducts(productsData || {});
        setDailyData(daily || {});
        setStatistics(stats || {});
        setWeeklyData(weekly || {});
        setMonthlyData(monthly || {});
        setTodayAnalytics(today || {});
        setWeekAnalytics(week || {});
        setMonthAnalytics(month || {});

        // Fetch today's hourly data for heatmap
        const today_key = formatDateKey(new Date());
        const hourlyToday = await getHourlyAnalytics(branchId, today_key);
        setHourlyData(hourlyToday || {});

        // Setup real-time listeners for the most dynamic data
        const summaryUnsub = onAnalyticsSummaryChange(branchId, (data) => {
          setSummary(data || {});
        });
        unsubscribes.push(summaryUnsub);

        const productsUnsub = onProductsAnalyticsChange(branchId, (data) => {
          setProducts(data || {});
        });
        unsubscribes.push(productsUnsub);

        const dailyUnsub = onDailyAnalyticsChange(branchId, (data) => {
          setDailyData(data || {});
        });
        unsubscribes.push(dailyUnsub);

        setLoading(false);
      } catch (error) {
        console.error('Error loading analytics:', error);
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [branchId]);

  if (initialLoading || loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--color-bg-primary)' }}>
        <div className={styles.spinner}></div>
      </div>
    );
  }

  // Assemble analytics data payload for the AI panel
  const aiAnalyticsData = {
    summary,
    products,
    daily: dailyData,
    hourly: hourlyData,
    weekly: weeklyData,
    monthly: monthlyData,
    statistics,
    todayAnalytics,
    weekAnalytics,
    monthAnalytics,
  };

  const hasOrders = summary?.totalOrders > 0;

  return (
    <DashboardLayout branchId={branchId}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Analytics</h1>
        {/* TEST-ONLY: Generate Test Orders button — not visible to customers */}
        <SeedDataButton branchId={branchId} onComplete={() => window.location.reload()} />
      </div>

      {!hasOrders ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--color-bg-card)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--color-border)' }}>
          <h2 style={{ fontSize: '1.2rem', color: 'var(--color-text-primary)', marginBottom: '8px' }}>No Data Available</h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '24px' }}>There are no completed orders for this branch yet.</p>
          <SeedDataButton branchId={branchId} onComplete={() => window.location.reload()} />
        </div>
      ) : (
        <>
          <BusinessOverview summary={summary} />
          
          <RevenueTrends dailyData={dailyData} monthlyData={monthlyData} />
          
          <OrderActivity hourlyData={hourlyData} dailyData={dailyData} />
          
          <ProductPerformance products={products} />
          
          <OperationalInsights />

          <AdvancedStats statistics={statistics} />

          <div id="ai" style={{ paddingTop: 'var(--space-8)' }}>
            <AIAnalystPanel analyticsData={aiAnalyticsData} branchId={branchId} />
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
