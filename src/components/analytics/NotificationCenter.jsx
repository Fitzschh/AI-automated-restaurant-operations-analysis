/**
 * Notification Center Component
 *
 * Persistent notification history with severity, approval status filtering,
 * 12-second auto-polling, archive, delete, and a View modal for full detail.
 *
 * Used on both Manager Dashboard and Admin Dashboard.
 * Admin sees all branches; manager sees their branch only (controlled by branchId prop).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getNotifications,
  archiveNotification,
  deleteNotification,
} from '../../lib/eventGatewayClient';

const POLL_INTERVAL_MS = 12000;

const SEVERITY_COLORS = {
  HIGH: { bg: 'rgba(231, 76, 60, 0.08)', border: 'rgba(231, 76, 60, 0.25)', dot: '#e74c3c' },
  MEDIUM: { bg: 'rgba(243, 156, 18, 0.08)', border: 'rgba(243, 156, 18, 0.25)', dot: '#f39c12' },
  LOW: { bg: 'rgba(22, 160, 133, 0.08)', border: 'rgba(22, 160, 133, 0.25)', dot: '#16a085' },
};

// Approval status filter tabs. The first entry ("all") is the default.
const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'PENDING_MANAGER', label: 'Pending Manager' },
  { key: 'PENDING_ADMIN', label: 'Pending Admin' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'archived', label: 'Archived' },
];

function formatTime(ts) {
  if (!ts) return '';
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function NotificationItem({ notification, onView, onArchive, onDelete }) {
  const severity = notification.severity || 'LOW';
  const colors = SEVERITY_COLORS[severity] || SEVERITY_COLORS.LOW;
  const isArchived = notification.archived;

  return (
    <div style={{
      padding: '12px 14px',
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      background: isArchived ? 'var(--color-bg-elevated)' : colors.bg,
      opacity: isArchived ? 0.7 : 1,
      transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: colors.dot,
          marginTop: 6, flexShrink: 0,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: '0.72rem', fontWeight: 800, color: colors.dot,
              textTransform: 'uppercase', letterSpacing: '0.3px',
            }}>
              {severity} {notification.source ? `· ${notification.source.replace(/_/g, ' ')}` : ''}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
              {formatTime(notification.timestamp)}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
            {notification.message}
          </p>
          {notification.action_plan && (
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
              Action Plan: {notification.action_plan}
            </p>
          )}
          {notification.decided_by && (
            <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
              By: {notification.decided_by}
            </p>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {notification.approval_status && (
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                fontSize: '0.7rem', fontWeight: 700, background: 'var(--color-bg-elevated)',
                color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)',
              }}>
                {notification.approval_status.replace(/_/g, ' ')}
              </span>
            )}
            {notification.workflow_id && (
              <span style={{
                fontSize: '0.66rem', padding: '2px 6px', borderRadius: 4,
                background: 'var(--color-bg-elevated)', color: 'var(--color-text-muted)',
                border: '1px solid var(--color-border)',
              }}>
                {notification.workflow_id}
              </span>
            )}
          </div>
          {notification.action_taken && (
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
              {notification.action_taken}
            </p>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={() => onView(notification)} style={tinyBtnStyle}>View</button>
        {!isArchived && (
          <button onClick={() => onArchive(notification.notification_id)} style={tinyBtnStyle}>Archive</button>
        )}
        <button
          onClick={() => onDelete(notification.notification_id)}
          style={{ ...tinyBtnStyle, color: '#e74c3c' }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/** Detail modal for View action. */
function ViewModal({ notification, onClose }) {
  if (!notification) return null;
  const severity = notification.severity || 'LOW';
  const colors = SEVERITY_COLORS[severity] || SEVERITY_COLORS.LOW;

  const rows = [
    ['Notification ID', notification.notification_id],
    ['Branch', notification.branch_id],
    ['Severity', severity],
    ['Source', notification.source?.replace(/_/g, ' ') || '—'],
    ['Approval Status', notification.approval_status?.replace(/_/g, ' ') || '—'],
    ['Workflow ID', notification.workflow_id || '—'],
    ['Decided By', notification.decided_by || '—'],
    ['Supplier Status', notification.supplier_status || '—'],
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-bg-card)', border: `1px solid ${colors.border}`,
          borderRadius: 12, padding: '20px 24px', width: '90%', maxWidth: 460,
          maxHeight: '80vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            Notification Detail
          </h3>
          <button onClick={onClose} style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--color-text-muted)', fontSize: '1.1rem',
          }}>✕</button>
        </div>

        {rows.map(([label, value]) => (
          <div key={label} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.3px' }}>
              {label}
            </div>
            <div style={{ fontSize: '0.88rem', color: 'var(--color-text-primary)' }}>
              {value}
            </div>
          </div>
        ))}

        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.3px' }}>
            Issue / Message
          </div>
          <div style={{ fontSize: '0.88rem', color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
            {notification.message}
          </div>
        </div>

        {notification.action_plan && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.3px' }}>
              Action Plan
            </div>
            <div style={{ fontSize: '0.88rem', color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
              {notification.action_plan}
            </div>
          </div>
        )}

        {notification.action_taken && (
          <div style={{ marginTop: 4, fontSize: '0.82rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            {notification.action_taken}
          </div>
        )}

        <div style={{ marginTop: 4, fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
          {formatTime(notification.timestamp)}
        </div>
      </div>
    </div>
  );
}

export default function NotificationCenter({ branchId }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewItem, setViewItem] = useState(null);

  const load = useCallback(async () => {
    const filters = {};
    if (branchId) filters.branchId = branchId;

    if (statusFilter === 'archived') {
      filters.archived = true;
    } else if (['PENDING_MANAGER', 'PENDING_ADMIN', 'COMPLETED'].includes(statusFilter)) {
      filters.approvalStatus = statusFilter;
      filters.archived = false;
    } else {
      filters.archived = false;
    }

    const result = await getNotifications(filters);
    setNotifications(result.notifications || []);
    setLoading(false);
  }, [branchId, statusFilter]);

  // Initial load + auto-poll every 12s
  useEffect(() => { load(); }, [load]);
  const timerRef = useRef(null);
  useEffect(() => {
    timerRef.current = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  async function handleArchive(id) {
    await archiveNotification(id);
    await load();
  }

  async function handleDelete(id) {
    await deleteNotification(id);
    await load();
  }

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
          Notification Center
        </h2>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              style={{
                ...filterBtnStyle,
                background: statusFilter === tab.key ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                color: statusFilter === tab.key ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-5)' }}>Loading...</p>
      ) : notifications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-6)', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
          <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>No notifications</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {notifications.map((n) => (
            <NotificationItem
              key={n.notification_id}
              notification={n}
              onView={setViewItem}
              onArchive={handleArchive}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {viewItem && <ViewModal notification={viewItem} onClose={() => setViewItem(null)} />}
    </section>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const tinyBtnStyle = {
  padding: '4px 10px',
  borderRadius: 4,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg-elevated)',
  color: 'var(--color-text-muted)',
  fontWeight: 700,
  fontSize: '0.7rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const filterBtnStyle = {
  padding: '5px 10px',
  borderRadius: 6,
  border: 'none',
  fontWeight: 700,
  fontSize: '0.72rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'all 0.15s',
};
