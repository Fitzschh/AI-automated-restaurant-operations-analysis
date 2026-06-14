import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import DashboardLayout from '../components/layout/DashboardLayout';
import { AUTH_CONFIG } from '../config/authConfig';
import { onDeletedLogsChange, onLogsChange } from '../lib/menuApi';
import { excludeOrderFromAnalytics, includeOrderInAnalytics } from '../lib/analyticsApi';
import { clearAnalysisCache } from '../lib/aiAnalystService';

const CORRECTION_REASONS = [
  'Duplicate order',
  'Wrong quantity',
  'Testing order',
  'Staff training order',
  'Incorrect transaction',
  'Manual analytics correction',
];

function getItems(log) {
  if (!log?.items) return [];
  return Array.isArray(log.items) ? log.items : Object.values(log.items);
}

function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateInput(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getOrderTimestamp(log) {
  return log.timestamp || log.createdAt || 0;
}

function getBranchName(branchId) {
  return AUTH_CONFIG.branches[branchId]?.name || branchId;
}

function getPaymentStatus(log) {
  return log.paymentStatus || log.paymentMethod || log.status || 'Recorded';
}

function orderMatchesProduct(log, product) {
  if (!product) return true;
  return getItems(log).some((item) => {
    const name = String(item.name || item.productName || '').toLowerCase();
    const id = String(item.itemId || item.id || item.key || '').toLowerCase();
    return name === product || id === product;
  });
}

export default function AnalyticsHistoryPage() {
  const { branchId } = useParams();
  const [ordersByBranch, setOrdersByBranch] = useState({});
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [reason, setReason] = useState(CORRECTION_REASONS[0]);
  const [busyOrderId, setBusyOrderId] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!branchId) return undefined;

    const unsubscribers = [
      onLogsChange(branchId, (logs) => {
        setOrdersByBranch((current) => ({
          ...current,
          [branchId]: {
            ...(current[branchId] || {}),
            active: logs.map((log) => ({ ...log, branchId, archiveStatus: 'Active' })),
          },
        }));
      }),
      onDeletedLogsChange(branchId, (logs) => {
        setOrdersByBranch((current) => ({
          ...current,
          [branchId]: {
            ...(current[branchId] || {}),
            archived: logs.map((log) => ({ ...log, branchId, archiveStatus: 'Archived' })),
          },
        }));
      }),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [branchId]);

  const allOrders = useMemo(() => {
    return [
      ...(ordersByBranch[branchId]?.active || []),
      ...(ordersByBranch[branchId]?.archived || []),
    ]
      .sort((a, b) => getOrderTimestamp(a) - getOrderTimestamp(b));
  }, [branchId, ordersByBranch]);

  const productOptions = useMemo(() => {
    const products = new Map();
    allOrders.forEach((order) => {
      getItems(order).forEach((item) => {
        const label = item.name || item.productName || item.itemId || item.id;
        if (!label) return;
        const value = String(item.itemId || item.id || item.key || label).toLowerCase();
        products.set(value, label);
      });
    });
    return Array.from(products.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allOrders]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return allOrders.filter((order) => {
      const items = getItems(order);
      const orderDate = formatDateInput(getOrderTimestamp(order));
      const itemText = items.map((item) => item.name || item.productName || '').join(' ').toLowerCase();
      const searchTarget = [
        order.orderNum,
        order.customerName,
        getBranchName(order.branchId),
        getPaymentStatus(order),
        itemText,
      ].join(' ').toLowerCase();

      if (normalizedSearch && !searchTarget.includes(normalizedSearch)) return false;
      if (dateFrom && orderDate < dateFrom) return false;
      if (dateTo && orderDate > dateTo) return false;
      if (!orderMatchesProduct(order, productFilter)) return false;
      return true;
    });
  }, [allOrders, dateFrom, dateTo, productFilter, search]);

  async function handleExclude(order) {
    const confirmed = window.confirm(`Remove order #${order.orderNum} from analytics calculations? The order record will stay in history.`);
    if (!confirmed) return;

    setBusyOrderId(order.orderNum);
    setMessage('');
    try {
      await excludeOrderFromAnalytics(order.branchId, order.orderNum, reason);
      clearAnalysisCache(order.branchId);
      setMessage(`Order #${order.orderNum} was removed from analytics and calculations were rebuilt.`);
    } catch (error) {
      setMessage(error.message || 'Unable to update analytics history.');
    } finally {
      setBusyOrderId('');
    }
  }

  async function handleRestore(order) {
    setBusyOrderId(order.orderNum);
    setMessage('');
    try {
      await includeOrderInAnalytics(order.branchId, order.orderNum);
      clearAnalysisCache(order.branchId);
      setMessage(`Order #${order.orderNum} was restored to analytics.`);
    } catch (error) {
      setMessage(error.message || 'Unable to restore order analytics.');
    } finally {
      setBusyOrderId('');
    }
  }

  return (
    <DashboardLayout branchId={branchId}>
      <div style={headerStyle}>
        <div>
          <h1 style={titleStyle}>Analytics History</h1>
          <p style={subtitleStyle}>
            Audit every order contributing to analytics, AI analysis, forecasting, and revenue reporting.
          </p>
        </div>
      </div>

      <section style={filterPanelStyle}>
        <div style={filterGridStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Order ID, item, customer, payment..."
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>From</span>
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={inputStyle} />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>To</span>
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} style={inputStyle} />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Product</span>
            <select value={productFilter} onChange={(event) => setProductFilter(event.target.value)} style={inputStyle}>
              <option value="">All products</option>
              {productOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Correction Reason</span>
            <select value={reason} onChange={(event) => setReason(event.target.value)} style={inputStyle}>
              {CORRECTION_REASONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {message && (
        <div style={messageStyle}>{message}</div>
      )}

      <section style={tableShellStyle}>
        <div style={tableHeaderStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Recorded Orders</h2>
            <p style={subtitleStyle}>{filteredOrders.length} of {allOrders.length} orders shown</p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Order ID</th>
                <th style={thStyle}>Date & Time</th>
                <th style={thStyle}>Ordered Items</th>
                <th style={thStyle}>Quantity</th>
                <th style={thStyle}>Total Amount</th>
                <th style={thStyle}>Payment Status</th>
                <th style={thStyle}>Branch Location</th>
                <th style={thStyle}>Analytics</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => {
                const items = getItems(order);
                const quantity = items.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
                const isExcluded = order.analyticsExcluded === true;

                return (
                  <tr key={`${order.branchId}-${order.orderNum}`} style={isExcluded ? excludedRowStyle : null}>
                    <td style={tdStyle}>#{order.orderNum}</td>
                    <td style={tdStyle}>{formatDateTime(getOrderTimestamp(order))}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        {items.map((item, index) => (
                          <span key={`${item.name || item.itemId}-${index}`}>
                            {item.name || item.productName || 'Unnamed item'} x{item.quantity || 1}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={tdStyle}>{quantity}</td>
                    <td style={tdStyle}>₱{Number(order.total || 0).toFixed(2)}</td>
                    <td style={tdStyle}>{getPaymentStatus(order)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <span>{getBranchName(order.branchId)}</span>
                        <span style={archiveBadgeStyle}>{order.archiveStatus || 'Active'}</span>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      {isExcluded ? (
                        <div style={{ display: 'grid', gap: 8 }}>
                          <span style={excludedBadgeStyle}>Excluded</span>
                          <span style={reasonTextStyle}>{order.analyticsExcludedReason || 'Manual correction'}</span>
                          <button
                            type="button"
                            onClick={() => handleRestore(order)}
                            disabled={busyOrderId === order.orderNum}
                            style={secondaryButtonStyle}
                          >
                            Restore
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleExclude(order)}
                          disabled={busyOrderId === order.orderNum}
                          style={dangerButtonStyle}
                        >
                          {busyOrderId === order.orderNum ? 'Updating...' : 'Remove From Analytics'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--color-text-muted)', padding: '32px 16px' }}>
                    No orders match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardLayout>
  );
}

const headerStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  marginBottom: 'var(--space-5)',
};

const titleStyle = {
  fontSize: '1.8rem',
  fontWeight: 700,
  margin: 0,
  color: 'var(--color-text-primary)',
};

const subtitleStyle = {
  fontSize: '0.9rem',
  color: 'var(--color-text-muted)',
  margin: 'var(--space-1) 0 0 0',
};

const filterPanelStyle = {
  background: 'var(--color-bg-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: 'var(--space-5)',
  marginBottom: 'var(--space-5)',
};

const filterGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 'var(--space-4)',
};

const fieldStyle = {
  display: 'grid',
  gap: 6,
};

const labelStyle = {
  color: 'var(--color-text-muted)',
  fontSize: '0.76rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: 0,
};

const inputStyle = {
  width: '100%',
  background: 'var(--color-bg-input)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-text-primary)',
  padding: '10px 12px',
  font: 'inherit',
};

const messageStyle = {
  marginBottom: 'var(--space-4)',
  padding: '10px 12px',
  border: '1px solid rgba(22, 160, 133, 0.28)',
  borderRadius: 8,
  background: 'rgba(22, 160, 133, 0.1)',
  color: 'var(--color-accent)',
  fontSize: '0.88rem',
  fontWeight: 700,
};

const tableShellStyle = {
  background: 'var(--color-bg-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  overflow: 'hidden',
};

const tableHeaderStyle = {
  padding: 'var(--space-5)',
  borderBottom: '1px solid var(--color-border)',
};

const sectionTitleStyle = {
  fontSize: '1.1rem',
  color: 'var(--color-text-primary)',
  margin: 0,
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: 1080,
};

const thStyle = {
  textAlign: 'left',
  padding: '12px 14px',
  borderBottom: '1px solid var(--color-border)',
  color: 'var(--color-text-muted)',
  fontSize: '0.74rem',
  textTransform: 'uppercase',
  letterSpacing: 0,
  background: 'var(--color-bg-elevated)',
};

const tdStyle = {
  padding: '14px',
  borderBottom: '1px solid var(--color-border)',
  color: 'var(--color-text-secondary)',
  fontSize: '0.86rem',
  verticalAlign: 'top',
};

const excludedRowStyle = {
  opacity: 0.68,
  background: 'var(--color-bg-elevated)',
};

const dangerButtonStyle = {
  border: '1px solid rgba(231, 76, 60, 0.35)',
  background: 'var(--color-danger-subtle)',
  color: 'var(--color-danger)',
  borderRadius: 8,
  padding: '8px 10px',
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: '0.78rem',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

const secondaryButtonStyle = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg-card)',
  color: 'var(--color-text-secondary)',
  borderRadius: 8,
  padding: '7px 10px',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '0.78rem',
  fontFamily: 'inherit',
};

const excludedBadgeStyle = {
  display: 'inline-flex',
  width: 'fit-content',
  borderRadius: 999,
  padding: '4px 8px',
  background: 'var(--color-danger-subtle)',
  color: 'var(--color-danger)',
  fontSize: '0.72rem',
  fontWeight: 800,
};

const reasonTextStyle = {
  color: 'var(--color-text-muted)',
  fontSize: '0.76rem',
};

const archiveBadgeStyle = {
  display: 'inline-flex',
  width: 'fit-content',
  borderRadius: 999,
  padding: '3px 7px',
  background: 'var(--color-bg-elevated)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-muted)',
  fontSize: '0.68rem',
  fontWeight: 800,
};
