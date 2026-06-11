import { formatProductName } from '../../lib/formatProductName';
import styles from './InventoryPage.module.css';

export default function InventoryCard({ item, itemId, onClick }) {
  const stock = item.currentStock || 0;
  const warning = item.warningLevel || 10;
  const critical = item.criticalLevel || 5;
  
  let status = 'healthy';
  let badgeLabel = 'Healthy';
  let progressColor = 'var(--color-success)';

  if (stock === 0) {
    status = 'out';
    badgeLabel = 'Out of Stock';
    progressColor = 'var(--color-danger)';
  } else if (stock <= critical) {
    status = 'out'; // Re-using red styling for critical
    badgeLabel = 'Critical';
    progressColor = 'var(--color-danger)';
  } else if (stock <= warning) {
    status = 'low';
    badgeLabel = 'Low Stock';
    progressColor = 'var(--color-warning)';
  }

  // Calculate progress bar width (max out at 2x warning level to show some context)
  const maxBarVal = Math.max(warning * 2, stock);
  const progressPct = Math.min(100, Math.max(0, (stock / maxBarVal) * 100));

  const lastUpdated = item.lastUpdated 
    ? new Date(item.lastUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Never';

  return (
    <div className={styles.card} onClick={() => onClick(itemId, item)}>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>{formatProductName(item.productName || itemId)}</h3>
        </div>
        <span className={`${styles.badge} ${styles[status]}`}>{badgeLabel}</span>
      </div>

      <div className={styles.stockDisplay}>
        <span className={styles.stockValue}>{stock}</span>
        <span className={styles.stockUnit}>{item.unit || 'units'}</span>
      </div>

      <div className={styles.progressContainer}>
        <div 
          className={styles.progressBar} 
          style={{ 
            width: `${progressPct}%`,
            backgroundColor: progressColor 
          }} 
        />
      </div>

      <div className={styles.cardFooter}>
        <span>Threshold: {warning}</span>
        <span>Updated: {lastUpdated}</span>
      </div>
    </div>
  );
}
