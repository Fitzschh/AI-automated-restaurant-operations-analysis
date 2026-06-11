import { useState } from 'react';
import OrderLogCard from './OrderLogCard';
import OrderDetailModal from './OrderDetailModal';
import styles from './OrderLogs.module.css';

export default function TrashBinModal({ logs, onClose, onClearBin, clearing }) {
    const [selectedLog, setSelectedLog] = useState(null);

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.modalHeader} style={{ alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700' }}>Deleted Logs</h2>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        {logs.length > 0 && (
                            <button
                                className={styles.clearBinBtn}
                                onClick={onClearBin}
                                disabled={clearing}
                            >
                                {clearing ? 'Clearing...' : 'Clear Bin'}
                            </button>
                        )}
                        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: '24px' }}>
                    {logs.length === 0 ? (
                        <div className={styles.emptyState}>Trash bin is empty.</div>
                    ) : (
                        <div className={styles.logsGrid}>
                            {logs.map(log => (
                                <OrderLogCard
                                    key={log.orderNum}
                                    log={log}
                                    onClick={() => setSelectedLog(log)}
                                    isDeleted={true}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Detail Modal for viewing deleted log contents */}
            {selectedLog && (
                <OrderDetailModal
                    log={selectedLog}
                    onClose={() => setSelectedLog(null)}
                />
            )}
        </div>
    );
}
