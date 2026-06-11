import { useMemo } from 'react';
import { formatCurrency, formatNumber } from '../../lib/statisticsUtils';
import { formatProductName } from '../../lib/formatProductName';
import { HorizontalBar } from './MiniChart';
import styles from './AnalyticsSections.module.css';

export default function ProductPerformance({ products }) {
  const { topProducts, bottomProducts, maxQuantity } = useMemo(() => {
    if (!products || Object.keys(products).length === 0) {
      return { topProducts: [], bottomProducts: [], maxQuantity: 0 };
    }

    const prodsArray = Object.entries(products).map(([id, data]) => ({
      id,
      name: formatProductName(data.name || id),
      quantitySold: data.quantitySold || 0,
      revenue: data.revenue || 0
    }));

    // Sort by quantity descending
    prodsArray.sort((a, b) => b.quantitySold - a.quantitySold);

    const maxQ = prodsArray.length > 0 ? prodsArray[0].quantitySold : 0;
    
    // Get top 5
    const top = prodsArray.slice(0, 5);
    
    // Get bottom 5 (excluding items with 0 sales if possible, or just the lowest)
    // Only show bottom if we have at least 6 products
    const bottom = prodsArray.length > 5 
      ? [...prodsArray].reverse().slice(0, 5)
      : [];

    return { topProducts: top, bottomProducts: bottom, maxQuantity: maxQ };
  }, [products]);

  if (topProducts.length === 0) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>Product Performance</h2>
          <p className={styles.sectionSubtitle}>Ranking by volume across all time.</p>
        </div>
      </div>

      <div className={styles.panelGrid}>
        {/* Top Products */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Top Performers</h3>
          </div>
          
          <div className={styles.rankingList}>
            {topProducts.map((prod, i) => (
              <div key={prod.id} className={styles.rankingItem}>
                <div className={styles.rankingHeader}>
                  <span className={styles.rankingName}>
                    {i + 1}. {prod.name}
                  </span>
                  <span className={styles.rankingValue}>
                    {formatNumber(prod.quantitySold)} 
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginLeft: '4px', fontWeight: 'normal' }}>
                      ({formatCurrency(prod.revenue)})
                    </span>
                  </span>
                </div>
                <HorizontalBar value={prod.quantitySold} max={maxQuantity} color="#2ecc71" />
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Products */}
        {bottomProducts.length > 0 && (
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Lowest Performers</h3>
            </div>
            
            <div className={styles.rankingList}>
              {bottomProducts.map((prod, i) => (
                <div key={prod.id} className={styles.rankingItem}>
                  <div className={styles.rankingHeader}>
                    <span className={styles.rankingName}>
                      {prod.name}
                    </span>
                    <span className={styles.rankingValue}>
                      {formatNumber(prod.quantitySold)}
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginLeft: '4px', fontWeight: 'normal' }}>
                        ({formatCurrency(prod.revenue)})
                      </span>
                    </span>
                  </div>
                  {/* For bottom items, max is relative to the highest of the bottom group to show variance, 
                      or just relative to global max. Let's use global max so they look small. */}
                  <HorizontalBar value={prod.quantitySold} max={maxQuantity} color="#e74c3c" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
