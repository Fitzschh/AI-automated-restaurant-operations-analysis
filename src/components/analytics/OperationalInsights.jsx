import { BrainIcon } from './AnalyticsIcons';
import styles from './AnalyticsSections.module.css';

export default function OperationalInsights() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>Operational Insights</h2>
          <p className={styles.sectionSubtitle}>AI-powered recommendations & insights</p>
        </div>
      </div>

      <div 
        className={styles.panel} 
        style={{ 
          background: 'linear-gradient(135deg, rgba(155, 89, 182, 0.15), rgba(52, 152, 219, 0.05))',
          borderColor: 'rgba(155, 89, 182, 0.25)',
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 'var(--space-5)',
          borderRadius: 'var(--radius-lg)'
        }}
      >
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            width: '60px', 
            height: '60px', 
            borderRadius: '50%', 
            background: 'linear-gradient(135deg, var(--color-accent), #9b59b6)',
            color: '#fff',
            boxShadow: '0 4px 15px rgba(155, 89, 182, 0.4)',
            flexShrink: 0
          }}
        >
          <BrainIcon size={32} />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 6px 0' }}>
            Operations AI Assistant
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
            To get personalized recommendations, real-time demand forecasting, inventory alerts, and actionable upselling recommendations, tap the **AI Assistant** bubble in the bottom right corner of your screen.
          </p>
        </div>
      </div>
    </section>
  );
}

