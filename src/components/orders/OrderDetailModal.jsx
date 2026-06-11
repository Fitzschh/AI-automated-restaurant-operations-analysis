import styles from './OrderLogs.module.css';

function formatTimestamp(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

export default function OrderDetailModal({ log, onClose }) {
    if (!log) return null;

    const items = Array.isArray(log.items) ? log.items : Object.values(log.items || {});
    const paymentLower = (log.paymentMethod || '').toLowerCase();
    const isCounter = paymentLower === 'counter';

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.modalHeader}>
                    <div className={styles.modalHeaderLeft}>
                        <span className={styles.modalOrderName}>{log.customerName || 'Unknown'}</span>
                        <span className={styles.modalOrderNum}>#{log.orderNum}</span>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
                </div>

                {/* Meta: time + payment */}
                <div className={styles.modalMeta}>
                    <span className={styles.modalTime}>{formatTimestamp(log.timestamp)}</span>
                    <span className={`${styles.paymentBadge} ${!isCounter ? styles.paymentOnline : styles.paymentCounter}`}>
                        {!isCounter ? 'Online' : 'Counter'}
                    </span>
                </div>

                {/* Items */}
                <div className={styles.modalItems}>
                    <div className={styles.itemsLabel}>Items</div>
                    {items.map((item, i) => (
                        <div className={styles.itemRow} key={i}>
                            <div className={styles.itemInfo}>
                                <span className={styles.itemName}>{item.name}</span>
                                <span className={styles.itemQty}>×{item.quantity}</span>
                            </div>
                            <span className={styles.itemPrice}>₱{Number(item.subtotal || item.price * item.quantity).toFixed(2)}</span>
                        </div>
                    ))}
                </div>

                {/* Total */}
                <div className={styles.modalFooter}>
                    <span className={styles.totalLabel}>Total</span>
                    <span className={styles.totalValue}>₱{Number(log.total || 0).toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
}
