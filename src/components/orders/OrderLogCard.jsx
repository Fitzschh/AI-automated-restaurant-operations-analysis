import styles from './OrderLogs.module.css';

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

export default function OrderLogCard({ log, onClick, onDelete, isDeleted }) {
    function handleDelete(e) {
        e.stopPropagation();
        if (onDelete) onDelete(log.orderNum, log);
    }

    return (
        <div className={styles.logCard} onClick={onClick}>
            <div className={styles.cardLeft}>
                <span className={styles.orderName}>{log.customerName || 'Unknown'}</span>
                <span className={styles.orderNum}>#{log.orderNum}</span>
                <span className={styles.orderTime}>{formatTimestamp(log.timestamp)}</span>
            </div>

            <div className={styles.cardRight}>
                {!isDeleted && (
                    <button
                        className={styles.deleteLogBtn}
                        onClick={handleDelete}
                        title="Move to Trash"
                    >
                        ✕
                    </button>
                )}
                <span className={styles.cardArrow}>›</span>
            </div>
        </div>
    );
}
