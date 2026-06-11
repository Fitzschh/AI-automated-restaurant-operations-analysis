import styles from './MenuPage.module.css';

function formatTimestamp(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

export default function MenuLogsModal({ logs, onClose, branchLabel }) {
    return (
        <div className={styles.menuLogsOverlay} onClick={onClose}>
            <div className={styles.menuLogsContent} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.menuLogsHeader}>
                    <h2>Menu Logs{branchLabel ? ` — ${branchLabel}` : ''}</h2>
                    <button className={styles.menuLogsCloseBtn} onClick={onClose} aria-label="Close">✕</button>
                </div>

                {/* Body */}
                <div className={styles.menuLogsBody}>
                    {logs.length === 0 ? (
                        <div className={styles.menuLogsEmpty}>No menu changes recorded yet.</div>
                    ) : (
                        <div className={styles.menuLogsList}>
                            {logs.map(entry => (
                                <div className={styles.menuLogEntry} key={entry.id}>
                                    <div className={styles.menuLogAction}>{entry.action}</div>
                                    <div className={styles.menuLogMeta}>
                                        <span className={styles.menuLogEmail}>{entry.email}</span>
                                        <span className={styles.menuLogTime}>{formatTimestamp(entry.timestamp)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
