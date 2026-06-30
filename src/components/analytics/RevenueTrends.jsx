import { useState, useMemo } from 'react';
import { formatCurrency } from '../../lib/statisticsUtils';
import { LineChart } from './MiniChart';
import styles from './AnalyticsSections.module.css';

// ─── Date-Filling Utilities ─────────────────────────────────────────────────

/**
 * Generate all dates between start and end (inclusive) as YYYY-MM-DD strings.
 */
function generateDateRange(startStr, endStr) {
  const dates = [];
  const start = new Date(`${startStr}T00:00:00`);
  const end = new Date(`${endStr}T00:00:00`);
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(cursor.toISOString().split('T')[0]);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/**
 * Generate all months between start and end (inclusive) as YYYY-MM strings.
 */
function generateMonthRange(startStr, endStr) {
  const months = [];
  const [sy, sm] = startStr.split('-').map(Number);
  const [ey, em] = endStr.split('-').map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

function formatDayLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMonthLabel(monthKey) {
  const date = new Date(`${monthKey}-01T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function pctChange(current, previous) {
  if (!previous || previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function RevenueTrends({ dailyData, monthlyData }) {
  const [period, setPeriod] = useState('7d');

  const chartData = useMemo(() => {
    if (!dailyData || !monthlyData) return { points: [], labels: [], total: 0, avg: 0, peak: 0, growthPct: 0 };

    let dataPoints = [];
    let labels = [];
    let total = 0;
    let peak = 0;

    if (period === '12m') {
      const sortedMonths = Object.keys(monthlyData).sort();
      if (sortedMonths.length === 0) return { points: [], labels: [], total: 0, avg: 0, peak: 0, growthPct: 0 };

      const last12 = sortedMonths.slice(-12);
      // Fill ALL months in the range
      const allMonths = generateMonthRange(last12[0], last12[last12.length - 1]);

      dataPoints = allMonths.map(m => {
        const rev = monthlyData[m]?.revenue || 0;
        total += rev;
        if (rev > peak) peak = rev;
        return rev;
      });
      labels = allMonths.map(formatMonthLabel);
    } else {
      const sortedDays = Object.keys(dailyData).sort();
      if (sortedDays.length === 0) return { points: [], labels: [], total: 0, avg: 0, peak: 0, growthPct: 0 };

      const daysToTake = period === '7d' ? 7 : 30;

      // Determine the date range
      const endDate = sortedDays[sortedDays.length - 1];
      const endDateObj = new Date(`${endDate}T00:00:00`);
      const startDateObj = new Date(endDateObj);
      startDateObj.setDate(startDateObj.getDate() - (daysToTake - 1));
      const startDate = startDateObj.toISOString().split('T')[0];

      // Fill ALL dates in the range (no gaps)
      const allDates = generateDateRange(startDate, endDate);

      dataPoints = allDates.map(d => {
        const rev = dailyData[d]?.revenue || 0;
        total += rev;
        if (rev > peak) peak = rev;
        return rev;
      });
      labels = allDates.map(formatDayLabel);
    }

    const avg = dataPoints.length > 0 ? total / dataPoints.length : 0;

    // Compute growth: compare last value to first non-zero value
    const firstNonZero = dataPoints.find(v => v > 0) || 0;
    const lastValue = dataPoints[dataPoints.length - 1] || 0;
    const growthPct = pctChange(lastValue, firstNonZero);

    return { points: dataPoints, labels, total, avg, peak, growthPct };
  }, [dailyData, monthlyData, period]);

  const growthSign = chartData.growthPct > 0 ? '+' : '';
  const growthColor = chartData.growthPct > 0 ? 'var(--color-success)' : chartData.growthPct < 0 ? 'var(--color-danger)' : 'var(--color-text-muted)';

  return (
    <section className={styles.section}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <h3 className={styles.panelTitle}>Revenue Trends</h3>
            {chartData.growthPct !== 0 && (
              <span style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: growthColor,
                background: chartData.growthPct > 0 ? 'var(--color-success-subtle)' : 'var(--color-danger-subtle)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
              }}>
                {growthSign}{chartData.growthPct}%
              </span>
            )}
          </div>
          <div className={styles.panelTabs}>
            <button
              className={`${styles.panelTab} ${period === '7d' ? styles.active : ''}`}
              onClick={() => setPeriod('7d')}
            >
              7 Days
            </button>
            <button
              className={`${styles.panelTab} ${period === '30d' ? styles.active : ''}`}
              onClick={() => setPeriod('30d')}
            >
              30 Days
            </button>
            <button
              className={`${styles.panelTab} ${period === '12m' ? styles.active : ''}`}
              onClick={() => setPeriod('12m')}
            >
              12 Months
            </button>
          </div>
        </div>

        <div className={styles.chartContainer}>
          <LineChart
            data={chartData.points}
            labels={chartData.labels}
            color="#16a085"
            isCurrency={true}
            height={170}
            showTrendLine={true}
            showGridlines={true}
          />
        </div>

        <div className={styles.panelFooter}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Period Total</span>
            <span className={styles.statValue}>{formatCurrency(chartData.total)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Average</span>
            <span className={styles.statValue}>{formatCurrency(chartData.avg)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Peak</span>
            <span className={styles.statValue}>{formatCurrency(chartData.peak)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
