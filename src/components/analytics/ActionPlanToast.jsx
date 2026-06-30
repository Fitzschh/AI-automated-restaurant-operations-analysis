/**
 * Action Plan Toast — Actionable Approval Popup
 *
 * Surfaced by WorkflowNotificationProvider. Visually distinct from the
 * Live Operations Analyst toast: amber/red action-card styling with explicit
 * Accept / Reject controls so the user can act directly from the popup.
 *
 * Manager view (PENDING_MANAGER): shows Issue / Severity / Action Plan /
 * Timestamp + Accept / Reject.
 * Admin view (PENDING_ADMIN): additionally shows "Approved By: <manager>"
 * since the manager decision already happened.
 */

import { useEffect, useState } from 'react';
import { useWorkflowNotifications } from '../../context/WorkflowNotificationProvider';

const STATUS_META = {
  PENDING_MANAGER: { label: 'Manager Approval Required', tone: 'manager' },
  PENDING_ADMIN: { label: 'Admin Approval Required', tone: 'admin' },
};

function formatTime(ts) {
  if (!ts) return '';
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return d.toLocaleString([], {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function Field({ label, children }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.4px',
        textTransform: 'uppercase', color: 'var(--color-text-muted)',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '0.86rem', lineHeight: 1.4,
        color: 'var(--color-text-primary)', marginTop: 2,
      }}>
        {children}
      </div>
    </div>
  );
}

export default function ActionPlanToast() {
  const { activeToast, submitting, error, role, dismissToast, submitDecision } =
    useWorkflowNotifications();

  // Slide-in/out animation control.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (activeToast) setVisible(true);
    else setVisible(false);
  }, [activeToast?.workflow_id]);

  if (!activeToast) return null;

  const meta = STATUS_META[activeToast.status] || { label: activeToast.status, tone: 'admin' };
  const isAdminTier = meta.tone === 'admin';
  const severity = activeToast.severity || 'HIGH';

  // Accent: red-ish for HIGH, but the *frame* differs by tier so the two
  // notification streams are visually distinct (Issue 1 requirement).
  const accent = isAdminTier ? '#7c3aed' : '#e67e22'; // purple=admin, amber=manager
  const headerLabel = isAdminTier ? 'Admin Action Plan' : 'Manager Action Plan';

  async function handle(decision) {
    const res = await submitDecision(activeToast, decision);
    if (!res?.success) {
      // Keep the toast up so the error is visible; error comes via context.
      setVisible(true);
    }
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        width: '360px',
        maxWidth: 'calc(100vw - 40px)',
        zIndex: 10000,
        background: 'var(--color-bg-card, #fff)',
        border: `1px solid ${accent}66`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 12,
        boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
        padding: '14px 16px',
        transform: visible ? 'translateX(0)' : 'translateX(120%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.35s ease',
        fontFamily: 'inherit',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 9, height: 9, borderRadius: '50%', background: accent,
          animation: 'wftoast-pulse 1.4s ease-in-out infinite',
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.4px',
          textTransform: 'uppercase', color: accent,
        }}>
          {headerLabel}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
          {formatTime(activeToast.created_at)}
        </span>
        <button
          onClick={dismissToast}
          aria-label="Dismiss"
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--color-text-muted)', fontSize: '0.9rem', lineHeight: 1,
            padding: '0 0 0 6px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ marginTop: 6 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.4px',
            color: '#e74c3c', background: 'rgba(231,76,60,0.12)',
            padding: '2px 7px', borderRadius: 4,
          }}>
            {severity}
          </span>
          <span style={{
            fontSize: '0.7rem', color: 'var(--color-text-muted)',
            background: 'var(--color-bg-elevated)', padding: '2px 7px', borderRadius: 4,
          }}>
            {activeToast.branch_id}
          </span>
        </div>

        <div style={{
          fontSize: '1rem', fontWeight: 800, marginTop: 8,
          color: 'var(--color-text-primary)',
        }}>
          {activeToast.item_name || activeToast.item_key}
        </div>

        {(activeToast.issue || activeToast.message) && (
          <Field label="Issue">
            {activeToast.issue || activeToast.message}
          </Field>
        )}

        {activeToast.action_plan && (
          <Field label="Action Plan">{activeToast.action_plan}</Field>
        )}

        {typeof activeToast.hours_remaining === 'number' && (
          <Field label="Hours of Stock Remaining">
            {Math.round(activeToast.hours_remaining * 10) / 10}h
          </Field>
        )}

        {/* Admin tier: show who already approved (manager). */}
        {isAdminTier && activeToast.manager_decision && (
          <Field label="Approved By">
            {activeToast.manager_decision.decided_by || 'Manager'}{' '}
            ({activeToast.manager_decision.decision})
            {activeToast.manager_decision.decided_at &&
              ` · ${formatTime(activeToast.manager_decision.decided_at)}`}
          </Field>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          marginTop: 10, fontSize: '0.76rem', fontWeight: 700,
          color: 'var(--color-danger, #e74c3c)',
          background: 'var(--color-danger-subtle, rgba(231,76,60,0.08))',
          padding: '6px 10px', borderRadius: 6,
        }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={() => handle('APPROVED')}
          disabled={submitting}
          style={{
            flex: 1, padding: '9px 0', borderRadius: 8, cursor: 'pointer',
            border: '1px solid rgba(39,174,96,0.4)', fontFamily: 'inherit',
            background: 'rgba(39,174,96,0.14)', color: '#27ae60',
            fontWeight: 800, fontSize: '0.82rem',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          ✓ Accept
        </button>
        <button
          onClick={() => handle('REJECTED')}
          disabled={submitting}
          style={{
            flex: 1, padding: '9px 0', borderRadius: 8, cursor: 'pointer',
            border: '1px solid rgba(231,76,60,0.4)', fontFamily: 'inherit',
            background: 'rgba(231,76,60,0.12)', color: '#e74c3c',
            fontWeight: 800, fontSize: '0.82rem',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          ✕ Reject
        </button>
      </div>

      <style>{`@keyframes wftoast-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
    </div>
  );
}
