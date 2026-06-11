import { useState } from 'react';
import { formatCurrency, formatNumber } from '../../lib/statisticsUtils';
import { ChevronDownIcon } from './AnalyticsIcons';
import styles from './AnalyticsSections.module.css';

export default function AdvancedStats({ statistics }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!statistics) return null;

  return (
    <section className={styles.section} style={{ marginTop: 'var(--space-8)' }}>
      <button 
        className={styles.collapsibleTrigger} 
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <ChevronDownIcon 
          size={16} 
          style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} 
        />
        {isOpen ? 'Hide Advanced Analytics' : 'Show Advanced Analytics'}
      </button>

      <div className={`${styles.collapsibleContent} ${isOpen ? styles.open : ''}`}>
        <div className={styles.statsGrid}>
          
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Mean Daily Orders</span>
            <span className={styles.statValue}>{formatNumber(statistics.ordersPerDay?.mean || 0)}</span>
          </div>

          <div className={styles.statItem}>
            <span className={styles.statLabel}>Median Daily Orders</span>
            <span className={styles.statValue}>{formatNumber(statistics.ordersPerDay?.median || 0)}</span>
          </div>

          <div className={styles.statItem}>
            <span className={styles.statLabel}>Mean Daily Revenue</span>
            <span className={styles.statValue}>{formatCurrency(statistics.revenuePerDay?.mean || 0)}</span>
          </div>

          <div className={styles.statItem}>
            <span className={styles.statLabel}>Median Daily Revenue</span>
            <span className={styles.statValue}>{formatCurrency(statistics.revenuePerDay?.median || 0)}</span>
          </div>

        </div>
      </div>
    </section>
  );
}
