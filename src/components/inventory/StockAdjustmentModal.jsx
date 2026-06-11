import { useState, useEffect } from 'react';
import { 
  adjustStock, 
  updateInventoryItem, 
  getInventoryHistory 
} from '../../lib/inventoryApi';
import { formatProductName } from '../../lib/formatProductName';
import { 
  PlusIcon, MinusIcon, ArrowUpIcon, ArrowDownIcon, SyncIcon 
} from '../analytics/AnalyticsIcons';
import styles from './InventoryPage.module.css';

export default function StockAdjustmentModal({ isOpen, onClose, item, itemId, branchId, userId }) {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  
  // Custom adjustment state
  const [customAmount, setCustomAmount] = useState('');
  const [note, setNote] = useState('');
  
  // Settings state
  const [warningLevel, setWarningLevel] = useState('');
  const [criticalLevel, setCriticalLevel] = useState('');
  const [unit, setUnit] = useState('');

  useEffect(() => {
    if (isOpen && item) {
      setWarningLevel(item.warningLevel || 10);
      setCriticalLevel(item.criticalLevel || 5);
      setUnit(item.unit || 'units');
      setCustomAmount('');
      setNote('');
      loadHistory();
    }
  }, [isOpen, item]);

  const loadHistory = async () => {
    try {
      const histData = await getInventoryHistory(branchId, itemId);
      if (histData) {
        // Convert to array and sort descending
        const histArray = Object.entries(histData).map(([id, data]) => ({ id, ...data }));
        histArray.sort((a, b) => b.timestamp - a.timestamp);
        setHistory(histArray);
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.error("Failed to load history", err);
    }
  };

  if (!isOpen || !item) return null;

  const currentStock = item.currentStock || 0;

  const handleQuickAdjust = async (amount) => {
    setLoading(true);
    try {
      const newStock = Math.max(0, currentStock + amount);
      await adjustStock(
        branchId, 
        itemId, 
        amount, 
        currentStock, 
        newStock, 
        userId, 
        `Quick adjust ${amount > 0 ? '+' : ''}${amount}`
      );
      // Let the onValue listener update the parent state
      loadHistory();
    } catch (err) {
      console.error("Adjustment failed", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomAdjust = async (e) => {
    e.preventDefault();
    const amount = parseInt(customAmount, 10);
    if (isNaN(amount) || amount === 0) return;

    setLoading(true);
    try {
      const newStock = Math.max(0, currentStock + amount);
      await adjustStock(
        branchId, 
        itemId, 
        amount, 
        currentStock, 
        newStock, 
        userId, 
        note || 'Manual adjustment'
      );
      setCustomAmount('');
      setNote('');
      loadHistory();
    } catch (err) {
      console.error("Adjustment failed", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      await updateInventoryItem(branchId, itemId, {
        warningLevel: parseInt(warningLevel, 10) || 10,
        criticalLevel: parseInt(criticalLevel, 10) || 5,
        unit: unit || 'units'
      });
      // Don't close, let user keep editing if they want
    } catch (err) {
      console.error("Settings save failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{formatProductName(item.productName || itemId)}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          {/* Current Stock Display */}
          <div className={styles.currentStockRow}>
            <div>
              <div className={styles.sectionLabel} style={{ marginBottom: 4 }}>Current Stock</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1, letterSpacing: '-1px' }}>
                {currentStock} <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>{item.unit || 'units'}</span>
              </div>
            </div>
          </div>

          {/* Quick Adjustments */}
          <div className={styles.adjustmentSection}>
            <span className={styles.sectionLabel}>Quick Adjust</span>
            <div className={styles.quickAdjustGrid}>
              <button className={`${styles.quickBtn} ${styles.add}`} onClick={() => handleQuickAdjust(1)} disabled={loading}>
                <PlusIcon size={14} /> 1
              </button>
              <button className={`${styles.quickBtn} ${styles.add}`} onClick={() => handleQuickAdjust(5)} disabled={loading}>
                <PlusIcon size={14} /> 5
              </button>
              <button className={`${styles.quickBtn} ${styles.add}`} onClick={() => handleQuickAdjust(10)} disabled={loading}>
                <PlusIcon size={14} /> 10
              </button>
              <button className={`${styles.quickBtn} ${styles.sub}`} onClick={() => handleQuickAdjust(-1)} disabled={loading || currentStock < 1}>
                <MinusIcon size={14} /> 1
              </button>
              <button className={`${styles.quickBtn} ${styles.sub}`} onClick={() => handleQuickAdjust(-5)} disabled={loading || currentStock < 5}>
                <MinusIcon size={14} /> 5
              </button>
              <button className={`${styles.quickBtn} ${styles.sub}`} onClick={() => handleQuickAdjust(-10)} disabled={loading || currentStock < 10}>
                <MinusIcon size={14} /> 10
              </button>
            </div>
          </div>

          {/* Custom Adjust Form */}
          <div className={styles.adjustmentSection}>
            <span className={styles.sectionLabel}>Custom Adjust</span>
            <form onSubmit={handleCustomAdjust} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="number"
                placeholder="+/- qty"
                className={styles.numberInput}
                style={{ flex: 1 }}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
              />
              <input
                type="text"
                placeholder="Note (optional)"
                className={styles.textInput}
                style={{ flex: 2 }}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button type="submit" className={styles.primaryBtn} disabled={loading || !customAmount} style={{ padding: '8px 16px' }}>
                Apply
              </button>
            </form>
          </div>

          {/* Settings */}
          <div className={styles.adjustmentSection} style={{ marginTop: '32px' }}>
            <span className={styles.sectionLabel}>Item Settings</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div>
                <label className={styles.inputLabel}>Warning At</label>
                <input type="number" className={styles.numberInput} value={warningLevel} onChange={e => setWarningLevel(e.target.value)} />
              </div>
              <div>
                <label className={styles.inputLabel}>Critical At</label>
                <input type="number" className={styles.numberInput} value={criticalLevel} onChange={e => setCriticalLevel(e.target.value)} />
              </div>
              <div>
                <label className={styles.inputLabel}>Unit Name</label>
                <input type="text" className={styles.textInput} value={unit} onChange={e => setUnit(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleSaveSettings} disabled={loading} className={styles.primaryBtn} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                Save Settings
              </button>
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className={styles.adjustmentSection} style={{ marginTop: '32px', marginBottom: 0 }}>
              <span className={styles.sectionLabel}>Recent History</span>
              <div className={styles.historyList}>
                {history.slice(0, 10).map((entry, i) => (
                  <div key={entry.id || i} className={styles.historyItem}>
                    <div className={styles.historyLeft}>
                      <div className={styles.historyType}>
                        {entry.type === 'increase' && <ArrowUpIcon size={12} color="var(--color-success)" />}
                        {entry.type === 'decrease' && <ArrowDownIcon size={12} color="var(--color-danger)" />}
                        {entry.type === 'sync' && <SyncIcon size={12} color="var(--color-info)" />}
                        {entry.type === 'adjustment' && <SyncIcon size={12} color="var(--color-warning)" />}
                        <span style={{ textTransform: 'capitalize' }}>{entry.type}</span>
                      </div>
                      <div className={styles.historyTime}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </div>
                      {entry.note && <div className={styles.historyNote}>{entry.note}</div>}
                    </div>
                    <div className={styles.historyRight} style={{ color: entry.type === 'decrease' ? 'var(--color-danger)' : 'var(--color-success)' }}>
                      {entry.type === 'decrease' ? '-' : '+'}{entry.quantity}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
