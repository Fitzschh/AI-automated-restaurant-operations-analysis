import { formatCurrency, formatNumber } from '../../lib/statisticsUtils';
import { formatProductName } from '../../lib/formatProductName';
import { RevenueIcon, OrdersIcon, ChartIcon, StarIcon, TrendDownIcon } from './AnalyticsIcons';
import styles from './AnalyticsSections.module.css';

export default function BusinessOverview({ summary }) {
  if (!summary) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>Business Overview</h2>
          <p className={styles.sectionSubtitle}>Key performance metrics across all time.</p>
        </div>
      </div>

      <div className={styles.kpiGrid}>
        {/* Total Revenue - Primary styling */}
        <div className={`${styles.kpiCard} ${styles.primary}`}>
          <div className={styles.kpiHeader}>
            <div className={styles.kpiIcon}>
              <RevenueIcon size={18} />
            </div>
            <h3 className={styles.kpiLabel}>Total Revenue</h3>
          </div>
          <p className={styles.kpiValue}>{formatCurrency(summary.totalRevenue || 0)}</p>
          <p className={styles.kpiSublabel}>Gross revenue all time</p>
        </div>

        {/* Total Orders */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <div className={styles.kpiIcon}>
              <OrdersIcon size={18} />
            </div>
            <h3 className={styles.kpiLabel}>Total Orders</h3>
          </div>
          <p className={styles.kpiValue}>{formatNumber(summary.totalOrders || 0)}</p>
          <p className={styles.kpiSublabel}>Completed orders</p>
        </div>

        {/* Avg Order Value */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <div className={styles.kpiIcon}>
              <ChartIcon size={18} />
            </div>
            <h3 className={styles.kpiLabel}>Avg Order Value</h3>
          </div>
          <p className={styles.kpiValue}>{formatCurrency(summary.averageOrderValue || 0)}</p>
          <p className={styles.kpiSublabel}>Revenue per order</p>
        </div>

        {/* Best Selling */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <div className={styles.kpiIcon}>
              <StarIcon size={18} />
            </div>
            <h3 className={styles.kpiLabel}>Best Selling Item</h3>
          </div>
          <p className={styles.kpiValue} style={{ fontSize: '1.4rem' }}>
            {formatProductName(summary.bestSellingItem) || '--'}
          </p>
          <p className={styles.kpiSublabel}>By quantity sold</p>
        </div>

        {/* Lowest Selling */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <div className={styles.kpiIcon}>
              <TrendDownIcon size={18} />
            </div>
            <h3 className={styles.kpiLabel}>Lowest Selling Item</h3>
          </div>
          <p className={styles.kpiValue} style={{ fontSize: '1.4rem' }}>
            {formatProductName(summary.leastSellingItem) || '--'}
          </p>
          <p className={styles.kpiSublabel}>Action required</p>
        </div>
      </div>
    </section>
  );
}
