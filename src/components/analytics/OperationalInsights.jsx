import { BrainIcon, TrendUpIcon, InventoryIcon, AlertIcon } from './AnalyticsIcons';
import styles from './AnalyticsSections.module.css';

export default function OperationalInsights() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>Operational Insights</h2>
          <p className={styles.sectionSubtitle}>AI-powered recommendations (Preview)</p>
        </div>
      </div>

      <div className={styles.panelGrid} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        
        <div className={styles.panel} style={{ borderTop: '3px solid var(--color-success)', padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <TrendUpIcon size={18} color="var(--color-success)" />
            <h3 className={styles.panelTitle} style={{ fontSize: '0.95rem' }}>Increasing Demand</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Analyzing recent order velocity... AI connection required to identify trending products.
          </p>
        </div>

        <div className={styles.panel} style={{ borderTop: '3px solid var(--color-warning)', padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <InventoryIcon size={18} color="var(--color-warning)" />
            <h3 className={styles.panelTitle} style={{ fontSize: '0.95rem' }}>Inventory Risk</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Monitoring stock depletion rates... AI connection required to forecast stockouts.
          </p>
        </div>

        <div className={styles.panel} style={{ borderTop: '3px solid var(--color-info)', padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <BrainIcon size={18} color="var(--color-info)" />
            <h3 className={styles.panelTitle} style={{ fontSize: '0.95rem' }}>Revenue Opportunity</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Scanning for upselling patterns... AI connection required to generate bundling strategies.
          </p>
        </div>

        <div className={styles.panel} style={{ borderTop: '3px solid var(--color-danger)', padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <AlertIcon size={18} color="var(--color-danger)" />
            <h3 className={styles.panelTitle} style={{ fontSize: '0.95rem' }}>Decline Warning</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Tracking product drop-offs... AI connection required to detect underperforming menu items.
          </p>
        </div>

      </div>
    </section>
  );
}
