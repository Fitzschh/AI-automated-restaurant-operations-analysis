import styles from './AnalyticsDashboard.module.css';

export default function AnalyticsCard({ 
    title, 
    value, 
    subValue = null, 
    icon = null,
    highlight = false 
}) {
    return (
        <div className={`${styles.card} ${highlight ? styles.cardHighlight : ''}`}>
            <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{title}</h3>
                {icon && <span className={styles.cardIcon}>{icon}</span>}
            </div>
            
            <div className={styles.cardBody}>
                <div className={styles.cardValue}>{value}</div>
                {subValue && (
                    <div className={styles.cardSubValue}>{subValue}</div>
                )}
            </div>
        </div>
    );
}
