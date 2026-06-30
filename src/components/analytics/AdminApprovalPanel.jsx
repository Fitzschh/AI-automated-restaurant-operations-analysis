/**
 * Admin Approval Panel Component
 *
 * Shows workflows in PENDING_ADMIN state for admin review.
 * Admin can accept (triggers UiPath) or reject.
 */

import { useState, useEffect, useCallback } from 'react';
import { getWorkflows, postAdminDecision } from '../../lib/eventGatewayClient';

const SEVERITY_COLORS = {
  HIGH: { bg: 'rgba(231, 76, 60, 0.04)', border: 'rgba(231, 76, 60, 0.25)', text: '#e74c3c' },
  MEDIUM: { bg: 'rgba(243, 156, 18, 0.04)', border: 'rgba(243, 156, 18, 0.25)', text: '#f39c12' },
  LOW: { bg: 'rgba(22, 160, 133, 0.04)', border: 'rgba(22, 160, 133, 0.25)', text: '#16a085' },
};

const STATUS_LABELS = {
  PENDING_MANAGER: { label: 'Awaiting Manager', color: '#f39c12' },
  PENDING_ADMIN: { label: 'Awaiting Your Approval', color: '#e74c3c' },
  PENDING_UIPATH: { label: 'UiPath Processing', color: '#3498db' },
  PENDING_SUPPLIER: { label: 'Awaiting Supplier', color: '#9b59b6' },
  COMPLETED: { label: 'Completed', color: '#27ae60' },
  MANAGER_REJECTED: { label: 'Manager Rejected', color: '#95a5a6' },
  ADMIN_REJECTED: { label: 'Admin Rejected', color: '#95a5a6' },
  SUPPLIER_REJECTED: { label: 'Supplier Rejected', color: '#95a5a6' },
};

function formatTime(ts) {
  if (!ts) return '';
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function StatusBadge({ status }) {
  const info = STATUS_LABELS[status] || { label: status, color: '#95a5a6' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 6,
      fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.3px',
      color: info.color,
      background: `${info.color}18`,
      border: `1px solid ${info.color}40`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: info.color }} />
      {info.label}
    </span>
  );
}

function WorkflowCard({ workflow, onDecision, deciding }) {
  const severity = workflow.severity || 'HIGH';
  const colors = SEVERITY_COLORS[severity] || SEVERITY_COLORS.HIGH;
  const isPendingAdmin = workflow.status === 'PENDING_ADMIN';

  return (
    <div style={{
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      padding: '14px 16px',
      background: colors.bg,
      transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '0.72rem', fontWeight: 800, color: colors.text,
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              {severity}
            </span>
            <StatusBadge status={workflow.status} />
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
              {workflow.branch_id}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-text-primary)' }}>
            {workflow.item_name || workflow.item_key}
          </p>
        </div>
        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
          {formatTime(workflow.created_at)}
        </span>
      </div>

      {workflow.issue && (
        <p style={{ margin: '8px 0 0', fontSize: '0.84rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
          {workflow.issue}
        </p>
      )}

      {workflow.action_plan && (
        <div style={{
          margin: '10px 0',
          padding: '8px 12px', borderRadius: 6,
          background: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
        }}>
          <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Action Plan: {workflow.action_plan}
          </p>
        </div>
      )}

      {typeof workflow.hours_remaining === 'number' && (
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
          Stock remaining: {Math.round(workflow.hours_remaining * 10) / 10}h
        </p>
      )}

      {workflow.manager_decision && (
        <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
          Manager: {workflow.manager_decision.decided_by} · {workflow.manager_decision.decision}
          {workflow.manager_decision.decided_at && ` · ${formatTime(workflow.manager_decision.decided_at)}`}
        </p>
      )}

      {workflow.supplier_response && (
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
          Supplier: {workflow.supplier_response.status}
          {workflow.supplier_response.notes && ` — ${workflow.supplier_response.notes}`}
        </p>
      )}

      {isPendingAdmin && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            onClick={() => onDecision(workflow.workflow_id, 'APPROVED')}
            disabled={deciding}
            style={{ ...approvalBtn, background: 'rgba(39, 174, 96, 0.12)', color: '#27ae60', border: '1px solid rgba(39, 174, 96, 0.3)' }}
          >
            ✓ Approve & Trigger UiPath
          </button>
          <button
            onClick={() => onDecision(workflow.workflow_id, 'REJECTED')}
            disabled={deciding}
            style={{ ...approvalBtn, background: 'rgba(231, 76, 60, 0.12)', color: '#e74c3c', border: '1px solid rgba(231, 76, 60, 0.3)' }}
          >
            ✕ Reject
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminApprovalPanel({ adminEmail }) {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('pending'); // pending, approved, rejected, supplier, all

  const statusMap = {
    pending: { status: 'PENDING_ADMIN' },
    approved: { status: 'PENDING_UIPATH' },
    rejected: { statuses: ['ADMIN_REJECTED', 'MANAGER_REJECTED'] },
    supplier: { statuses: ['PENDING_SUPPLIER', 'COMPLETED', 'SUPPLIER_REJECTED'] },
    all: {},
  };

  const load = useCallback(async () => {
    setLoading(true);
    // For multi-status tabs (rejected, supplier), fetch all and filter client-side.
    const config = statusMap[viewMode] || {};
    const fetchAll = !config.status || config.statuses;
    const result = await getWorkflows(fetchAll ? {} : { status: config.status });
    let wfs = result.workflows || [];

    // Client-side filter for multi-status tabs
    if (config.statuses) {
      const statusSet = new Set(config.statuses);
      wfs = wfs.filter((w) => statusSet.has(w.status));
    }

    setWorkflows(wfs);
    setLoading(false);
  }, [viewMode]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 12s
  useEffect(() => {
    const timer = setInterval(load, 12000);
    return () => clearInterval(timer);
  }, [load]);

  async function handleDecision(workflowId, decision) {
    setDeciding(true);
    setError('');
    const result = await postAdminDecision({
      workflowId,
      decision,
      decidedBy: adminEmail,
    });
    if (!result.success) {
      setError(result.errors?.[0] || 'Decision failed');
    }
    await load();
    setDeciding(false);
  }

  const pendingCount = workflows.filter((w) => w.status === 'PENDING_ADMIN').length;

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
            Approval Queue
          </h2>
          {pendingCount > 0 && (
            <span style={{
              display: 'inline-block', marginTop: 4,
              padding: '2px 8px', borderRadius: 10,
              fontSize: '0.72rem', fontWeight: 800,
              color: '#e74c3c', background: 'rgba(231, 76, 60, 0.12)',
            }}>
              {pendingCount} pending
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {['pending', 'approved', 'rejected', 'supplier', 'all'].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '5px 10px', borderRadius: 6, border: 'none',
                fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit',
                background: viewMode === mode ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                color: viewMode === mode ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              {mode === 'pending' ? 'Pending' : mode === 'approved' ? 'Approved' : mode === 'rejected' ? 'Rejected' : mode === 'supplier' ? 'Supplier' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 'var(--space-3)', padding: '8px 12px', borderRadius: 6, background: 'var(--color-danger-subtle)', color: 'var(--color-danger)', fontSize: '0.82rem', fontWeight: 700 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-5)' }}>Loading...</p>
      ) : workflows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-6)', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
          <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>
            {viewMode === 'pending' ? 'No pending approvals' : 'No workflows yet'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {workflows.map((wf) => (
            <WorkflowCard
              key={wf.workflow_id}
              workflow={wf}
              onDecision={handleDecision}
              deciding={deciding}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const approvalBtn = {
  padding: '7px 14px',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: '0.78rem',
  fontFamily: 'inherit',
  transition: 'all 0.15s ease',
};
