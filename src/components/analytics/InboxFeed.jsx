/**
 * Inbox Feed Component
 *
 * Activity feed showing workflow events filtered by user role.
 * Managers see their branch. Admins see all branches.
 */

import { useState, useEffect, useCallback } from 'react';
import { getInbox } from '../../lib/eventGatewayClient';

const CATEGORY_STYLES = {
  APPROVAL_REQUESTED: { icon: '🔔', color: '#e74c3c', label: 'Approval Required' },
  APPROVAL_ACCEPTED: { icon: '✅', color: '#27ae60', label: 'Approved' },
  APPROVAL_REJECTED: { icon: '❌', color: '#e74c3c', label: 'Rejected' },
  SUPPLIER_CONFIRMATION: { icon: '📦', color: '#3498db', label: 'Supplier Response' },
  INVENTORY_UPDATE: { icon: '📊', color: '#16a085', label: 'Inventory Update' },
  SYSTEM: { icon: '⚙️', color: '#95a5a6', label: 'System' },
};

function formatTimeAgo(ts) {
  if (!ts) return '';
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function InboxItemCard({ item }) {
  const style = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.SYSTEM;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '12px 14px',
      borderBottom: '1px solid var(--color-border)',
      transition: 'background 0.15s',
    }}>
      <span style={{ fontSize: '1.1rem', lineHeight: 1.4 }}>{style.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {item.title}
          </p>
          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {formatTimeAgo(item.timestamp)}
          </span>
        </div>
        <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
          {item.message}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{
            fontSize: '0.68rem', fontWeight: 800, color: style.color,
            textTransform: 'uppercase', letterSpacing: '0.3px',
          }}>
            {style.label}
          </span>
          {item.actor && (
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
              by {item.actor}
            </span>
          )}
          {item.branch_id && (
            <span style={{
              fontSize: '0.68rem', padding: '1px 6px', borderRadius: 4,
              background: 'var(--color-bg-elevated)', color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
            }}>
              {item.branch_id}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InboxFeed({ branchId, role = 'admin' }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getInbox({ branchId, role });
    setItems(result.items || []);
    setLoading(false);
  }, [branchId, role]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
          Activity Inbox
        </h2>
        <button onClick={load} disabled={loading} style={refreshBtnStyle}>
          ↻ Refresh
        </button>
      </div>

      <div style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-5)' }}>Loading...</p>
        ) : items.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-6)', margin: 0 }}>
            No activity yet
          </p>
        ) : (
          items.map((item) => (
            <InboxItemCard key={item.inbox_id} item={item} />
          ))
        )}
      </div>
    </section>
  );
}

const refreshBtnStyle = {
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg-elevated)',
  color: 'var(--color-text-secondary)',
  fontWeight: 700,
  fontSize: '0.78rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
