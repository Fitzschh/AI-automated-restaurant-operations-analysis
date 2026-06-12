import { useState, useMemo } from 'react';
import { formatCurrency } from '../../lib/statisticsUtils';
import { LineChart } from './MiniChart';
import styles from './AnalyticsSections.module.css';

function formatDayLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMonthLabel(monthKey) {
  const date = new Date(`${monthKey}-01T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function RevenueTrends({ dailyData, monthlyData }) {
  const [period, setPeriod] = useState('7d'); // 7d, 30d, 12m

  const chartData = useMemo(() => {
    if (!dailyData || !monthlyData) return { points: [], labels: [], total: 0, avg: 0, peak: 0 };

    let dataPoints = [];
    let labels = [];
    let total = 0;
    let peak = 0;

    if (period === '12m') {
      // Use monthly data
      const sortedMonths = Object.keys(monthlyData).sort(); // YYYY-MM
      const last12 = sortedMonths.slice(-12);
      
      dataPoints = last12.map(m => {
        const rev = monthlyData[m]?.revenue || 0;
        total += rev;
        if (rev > peak) peak = rev;
        return rev;
      });
      labels = last12.map(formatMonthLabel);
    } else {
      // Use daily data
      const sortedDays = Object.keys(dailyData).sort(); // YYYY-MM-DD
      const daysToTake = period === '7d' ? 7 : 30;
      const lastDays = sortedDays.slice(-daysToTake);
      
      dataPoints = lastDays.map(d => {
        const rev = dailyData[d]?.revenue || 0;
        total += rev;
        if (rev > peak) peak = rev;
        return rev;
      });
      labels = lastDays.map(formatDayLabel);
    }

    const avg = dataPoints.length > 0 ? total / dataPoints.length : 0;

    return { points: dataPoints, labels, total, avg, peak };
  }, [dailyData, monthlyData, period]);

  return (
    <section className={styles.section}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Revenue Trends</h3>
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
          <LineChart data={chartData.points} labels={chartData.labels} color="#16a085" isCurrency={true} height={125} />
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
