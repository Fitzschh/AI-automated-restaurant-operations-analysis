import { useMemo } from 'react';
import { BarChart, HeatmapRow } from './MiniChart';
import { ClockIcon, CalendarIcon } from './AnalyticsIcons';
import styles from './AnalyticsSections.module.css';

function formatDateLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function OrderActivity({ hourlyData, dailyData }) {
  // Process hourly data
  const hourlyActivity = useMemo(() => {
    // Array of 24 hours, default 0
    const hours = Array(24).fill(0);
    let peakHour = 0;
    let peakOrders = 0;
    
    if (hourlyData && Object.keys(hourlyData).length > 0) {
      Object.entries(hourlyData).forEach(([hourStr, data]) => {
        const hour = parseInt(hourStr, 10);
        if (hour >= 0 && hour <= 23) {
          hours[hour] = data.orders || 0;
          if (data.orders > peakOrders) {
            peakOrders = data.orders;
            peakHour = hour;
          }
        }
      });
    }

    return { hours, peakHour, peakOrders };
  }, [hourlyData]);

  // Process daily order counts from the latest dates
  const dailyActivity = useMemo(() => {
    const days = [];
    const dayLabels = [];
    let peakLabel = '';
    let peakOrders = 0;

    if (dailyData && Object.keys(dailyData).length > 0) {
      const sortedDates = Object.keys(dailyData).sort().slice(-30);
      
      sortedDates.forEach((dateStr) => {
        const orders = dailyData[dateStr].orders || 0;
        const label = formatDateLabel(dateStr);
        days.push(orders);
        dayLabels.push(label);
        if (orders > peakOrders) {
          peakOrders = orders;
          peakLabel = label;
        }
      });
    }

    return { days, dayLabels, peakLabel, peakOrders };
  }, [dailyData]);

  const formatHour = (hour) => {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 || 12;
    return `${h}:00 ${ampm}`;
  };

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>Order Activity</h2>
          <p className={styles.sectionSubtitle}>When are customers ordering?</p>
        </div>
      </div>

      <div className={styles.panelGrid}>
        {/* Hourly Heatmap Panel */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Orders by Hour (Today)</h3>
            <ClockIcon size={16} color="var(--color-text-muted)" />
          </div>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', marginBottom: 'var(--space-3)' }}>
            <HeatmapRow data={hourlyActivity.hours} colorBase="22, 160, 133" height={40} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              <span>12 AM</span>
              <span>6 AM</span>
              <span>12 PM</span>
              <span>6 PM</span>
              <span>11 PM</span>
            </div>
          </div>

          <div className={styles.panelFooter} style={{ gridTemplateColumns: '1fr' }}>
            <div className={styles.statItem} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className={styles.statLabel}>Peak Hour Today</span>
              <span className={styles.statValue}>
                {hourlyActivity.peakOrders > 0 
                  ? `${formatHour(hourlyActivity.peakHour)} (${hourlyActivity.peakOrders} orders)` 
                  : 'No orders yet'}
              </span>
            </div>
          </div>
        </div>

        {/* Day of Week Panel */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Orders by Date (Last 30 Days)</h3>
            <CalendarIcon size={16} color="var(--color-text-muted)" />
          </div>
          
          <div className={styles.chartContainer} style={{ minHeight: '120px' }}>
            <BarChart 
              data={dailyActivity.days} 
              labels={dailyActivity.dayLabels}
              color="#3498db" 
              height={120} 
            />
          </div>

          <div className={styles.panelFooter} style={{ gridTemplateColumns: '1fr' }}>
            <div className={styles.statItem} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className={styles.statLabel}>Busiest Day</span>
              <span className={styles.statValue}>
                {dailyActivity.peakOrders > 0 
                  ? dailyActivity.peakLabel
                  : 'No data'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
