/**
 * Supplier Management Page
 *
 * Admin-only page for managing supplier records.
 * Supports create, edit, and delete operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { isUserAdmin } from '../config/authConfig';
import DashboardLayout from '../components/layout/DashboardLayout';
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '../lib/eventGatewayClient';

// ─── Sub-Components ─────────────────────────────────────────────────────────

function SupplierForm({ initial, onSubmit, onCancel, loading }) {
  const [name, setName] = useState(initial?.name || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [category, setCategory] = useState(initial?.product_category || '');
  const [notes, setNotes] = useState(initial?.notes || '');

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !category.trim()) return;
    onSubmit({ name: name.trim(), email: email.trim(), productCategory: category.trim(), notes: notes.trim() });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div>
        <label style={labelStyle}>Supplier Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Coffee Bean Co."
          required
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Email Address *</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="supplier@email.com"
          required
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Product Category *</label>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Coffee, Milk, Syrups"
          required
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes about this supplier"
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={loading} style={secondaryBtnStyle}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={loading} style={primaryBtnStyle}>
          {loading ? 'Saving...' : initial ? 'Update Supplier' : 'Add Supplier'}
        </button>
      </div>
    </form>
  );
}

function SupplierCard({ supplier, onEdit, onDelete, deleting }) {
  return (
    <div style={{
      background: 'var(--color-bg-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-5)',
      transition: 'border-color 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {supplier.name}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--color-accent)' }}>
            {supplier.email}
          </p>
        </div>
        <span style={{
          padding: '3px 10px',
          borderRadius: 6,
          fontSize: '0.72rem',
          fontWeight: 800,
          letterSpacing: '0.3px',
          color: 'var(--color-accent)',
          background: 'rgba(22, 160, 133, 0.12)',
          border: '1px solid rgba(22, 160, 133, 0.25)',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          {supplier.product_category}
        </span>
      </div>
      {supplier.notes && (
        <p style={{ margin: '10px 0 0', fontSize: '0.84rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          {supplier.notes}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
        <button onClick={() => onEdit(supplier)} style={smallBtnStyle}>Edit</button>
        <button
          onClick={() => onDelete(supplier.supplier_id)}
          disabled={deleting}
          style={{ ...smallBtnStyle, color: '#e74c3c', borderColor: 'rgba(231, 76, 60, 0.3)', background: 'rgba(231, 76, 60, 0.08)' }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function SupplierManagementPage() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);

  const isAdmin = isUserAdmin(user?.email);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await getSuppliers();
    if (result.success) {
      setSuppliers(result.suppliers);
    } else {
      setError('Failed to load suppliers');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  async function handleCreate(data) {
    setSaving(true);
    setError('');
    const result = await createSupplier(data);
    if (result.success) {
      setShowForm(false);
      await loadSuppliers();
    } else {
      setError(result.errors?.[0] || 'Failed to create supplier');
    }
    setSaving(false);
  }

  async function handleUpdate(data) {
    if (!editingSupplier) return;
    setSaving(true);
    setError('');
    const result = await updateSupplier(editingSupplier.supplier_id, data);
    if (result.success) {
      setEditingSupplier(null);
      await loadSuppliers();
    } else {
      setError(result.errors?.[0] || 'Failed to update supplier');
    }
    setSaving(false);
  }

  async function handleDelete(supplierId) {
    if (!window.confirm('Delete this supplier?')) return;
    setDeleting(true);
    setError('');
    const result = await deleteSupplier(supplierId);
    if (result.success) {
      await loadSuppliers();
    } else {
      setError('Failed to delete supplier');
    }
    setDeleting(false);
  }

  return (
    <DashboardLayout title="Supplier Management" showBack>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--space-4) 0' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
              Supplier Management
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--color-text-muted)' }}>
              Manage supplier records for automated restock workflows
            </p>
          </div>
          {isAdmin && !showForm && !editingSupplier && (
            <button onClick={() => setShowForm(true)} style={primaryBtnStyle}>
              + Add Supplier
            </button>
          )}
        </div>

        {error && (
          <div style={{ marginBottom: 'var(--space-4)', padding: '10px 14px', borderRadius: 8, background: 'var(--color-danger-subtle)', color: 'var(--color-danger)', fontSize: '0.88rem', fontWeight: 700 }}>
            {error}
          </div>
        )}

        {/* Add Form */}
        {showForm && (
          <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 var(--space-4) 0', color: 'var(--color-text-primary)' }}>
              New Supplier
            </h2>
            <SupplierForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} loading={saving} />
          </div>
        )}

        {/* Edit Form */}
        {editingSupplier && (
          <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-accent)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 var(--space-4) 0', color: 'var(--color-text-primary)' }}>
              Edit Supplier
            </h2>
            <SupplierForm
              initial={editingSupplier}
              onSubmit={handleUpdate}
              onCancel={() => setEditingSupplier(null)}
              loading={saving}
            />
          </div>
        )}

        {/* Supplier List */}
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-6)' }}>Loading suppliers...</p>
        ) : suppliers.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 'var(--space-8)',
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
          }}>
            <p style={{ fontSize: '1rem', color: 'var(--color-text-muted)', margin: 0 }}>
              No suppliers added yet. Click "Add Supplier" to get started.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            {suppliers.map((s) => (
              <SupplierCard
                key={s.supplier_id}
                supplier={s}
                onEdit={setEditingSupplier}
                onDelete={handleDelete}
                deleting={deleting}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const labelStyle = {
  display: 'block',
  fontSize: '0.82rem',
  fontWeight: 700,
  color: 'var(--color-text-secondary)',
  marginBottom: 4,
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  background: 'var(--color-bg-primary)',
  color: 'var(--color-text-primary)',
  fontSize: '0.92rem',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

const primaryBtnStyle = {
  padding: '10px 18px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--color-accent)',
  color: '#fff',
  fontWeight: 800,
  fontSize: '0.88rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const secondaryBtnStyle = {
  padding: '10px 18px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg-elevated)',
  color: 'var(--color-text-secondary)',
  fontWeight: 700,
  fontSize: '0.88rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const smallBtnStyle = {
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
