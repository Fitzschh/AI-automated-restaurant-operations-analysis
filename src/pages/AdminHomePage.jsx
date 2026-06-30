import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import { onAnalyticsChange } from '../lib/analyticsApi';
import { onMenuAndInventoryChange } from '../lib/inventoryApi';
import { formatCurrency, formatNumber } from '../lib/statisticsUtils';
import { DualLineChart, LineChart } from '../components/analytics/MiniChart';
import AdminApprovalPanel from '../components/analytics/AdminApprovalPanel';
import NotificationCenter from '../components/analytics/NotificationCenter';
import InboxFeed from '../components/analytics/InboxFeed';
import {
  RevenueIcon,
  OrdersIcon,
  InventoryIcon,
  AlertIcon,
  BotIcon,
  TrendUpIcon,
  TrendDownIcon,
} from '../components/analytics/AnalyticsIcons';
import { AUTH_CONFIG } from '../config/authConfig';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function generateDateRange(startStr, endStr) {
  const dates = [];
  const start = new Date(`${startStr}T00:00:00`);
  const end = new Date(`${endStr}T00:00:00`);
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(cursor.toISOString().split('T')[0]);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function formatDayLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function pctChange(curr, prev) {
  if (!prev || prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}


// ─── Sub-Components ─────────────────────────────────────────────────────────

function KPICard({ icon: Icon, label, value, subtitle, trend, accentColor, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.2s, border-color 0.2s, background 0.2s',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
      onMouseOver={(e) => { if (onClick) e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 'var(--radius-sm)',
          background: accentColor ? `${accentColor}18` : 'var(--color-bg-elevated)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: accentColor || 'var(--color-text-secondary)',
        }}>
          <Icon size={18} />
        </div>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{label}</span>
        {trend !== undefined && trend !== 0 && (
          <span style={{
            marginLeft: 'auto',
            fontSize: '0.72rem',
            fontWeight: 700,
            color: trend > 0 ? 'var(--color-success)' : 'var(--color-danger)',
            background: trend > 0 ? 'var(--color-success-subtle)' : 'var(--color-danger-subtle)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
          }}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div style={{ fontSize: '1.7rem', fontWeight: 700, color: accentColor || 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{subtitle}</div>
      )}
    </div>
  );
}

function SeverityCounter({ label, count, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      padding: '8px 12px', borderRadius: 'var(--radius-sm)',
      background: `${color}12`, border: `1px solid ${color}30`,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: color,
        animation: count > 0 ? 'pulse 1.5s ease-in-out infinite' : 'none',
      }} />
      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: '1.1rem', fontWeight: 800, color }}>{count}</span>
    </div>
  );
}

function BranchCard({ label, branchId, data, navigate }) {
  const revenue = Number(data?.summary?.totalRevenue || 0);
  const orders = Number(data?.summary?.totalOrders || 0);
  const avgOrder = orders > 0 ? revenue / orders : 0;

  return (
    <div
      onClick={() => navigate(`/home/${branchId}`)}
      style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        cursor: 'pointer',
        transition: 'transform 0.2s, border-color 0.2s',
      }}
      onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
      onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'var(--color-border)'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
        <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>{label}</h3>
        <span style={{ fontSize: '0.72rem', color: 'var(--color-accent)', fontWeight: 600 }}>View →</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
        <div>
          <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Revenue</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{formatCurrency(revenue)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Orders</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{formatNumber(orders)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Avg Order</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{formatCurrency(avgOrder)}</div>
        </div>
      </div>
    </div>
  );
}

function InsightRow({ text, priority }) {
  const color = priority === 'HIGH' ? '#e74c3c' : priority === 'MEDIUM' ? '#f39c12' : '#16a085';
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
      padding: '10px 12px', borderRadius: 'var(--radius-sm)',
      background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: color,
        flexShrink: 0, marginTop: 5,
      }} />
      <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AdminHomePage() {
  const navigate = useNavigate();
  const { nickname, user } = useAuth();

  const [branchData, setBranchData] = useState({});
  const [branchInventory, setBranchInventory] = useState({});


  // Subscribe to all active branches
  useEffect(() => {
    const activeBranches = Object.keys(AUTH_CONFIG.branches);
    const unsubs = activeBranches.map(branchId =>
      onAnalyticsChange(branchId, (data) => {
        setBranchData(prev => ({ ...prev, [branchId]: data }));
      })
    );
    return () => unsubs.forEach(unsub => unsub());
  }, []);

  useEffect(() => {
    const activeBranches = Object.keys(AUTH_CONFIG.branches);
    const unsubs = activeBranches.map(branchId =>
      onMenuAndInventoryChange(branchId, (inv) => {
        setBranchInventory(prev => ({ ...prev, [branchId]: inv }));
      })
    );
    return () => unsubs.forEach(unsub => unsub());
  }, []);

  // ── Computed metrics ──────────────────────────────────────────────
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalOrders = 0;
    let criticalCount = 0;
    let totalItems = 0;
    
    Object.values(branchData).forEach(data => {
      totalRevenue += Number(data?.summary?.totalRevenue || 0);
      totalOrders += Number(data?.summary?.totalOrders || 0);
    });

    Object.values(branchInventory).forEach(inv => {
      Object.values(inv || {}).forEach((item) => {
        totalItems++;
        const stock = Number(item?.stock ?? item?.currentStock ?? 0);
        if (stock <= 5) criticalCount++;
      });
    });

    const inventoryHealth = totalItems > 0
      ? Math.round(((totalItems - criticalCount) / totalItems) * 100)
      : 100;

    return {
      totalRevenue,
      totalOrders,
      avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      criticalInventory: criticalCount,
      inventoryHealth,
      totalItems,
    };
  }, [branchData, branchInventory]);

  // ── Revenue comparison chart data (7 Days) ────────────────────────
  const comparisonData = useMemo(() => {
    // Collect all dates from all branches
    const allDates = new Set();
    const branchIds = Object.keys(AUTH_CONFIG.branches);
    
    branchIds.forEach(id => {
      Object.keys(branchData[id]?.daily || {}).forEach(d => allDates.add(d));
    });
    
    const sorted = [...allDates].sort();
    if (sorted.length === 0) return { datasets: {}, labels: [] };

    const endDate = sorted[sorted.length - 1];
    const endObj = new Date(`${endDate}T00:00:00`);
    const startObj = new Date(endObj);
    startObj.setDate(startObj.getDate() - 6);
    const startDate = startObj.toISOString().split('T')[0];
    const range = generateDateRange(startDate, endDate);

    const datasets = {};
    branchIds.forEach(id => {
      datasets[id] = range.map(d => branchData[id]?.daily?.[d]?.revenue || 0);
    });

    return {
      datasets,
      labels: range.map(formatDayLabel),
    };
  }, [branchData]);

  // ── AI Insights (derived from data) ───────────────────────────────
  const insights = useMemo(() => {
    const result = [];
    const branchIds = Object.keys(AUTH_CONFIG.branches);

    // Revenue comparison (if multiple branches)
    if (branchIds.length > 1) {
      const b1 = branchIds[0];
      const b2 = branchIds[1];
      const rev1 = Number(branchData[b1]?.summary?.totalRevenue || 0);
      const rev2 = Number(branchData[b2]?.summary?.totalRevenue || 0);
      if (rev1 > 0 && rev2 > 0) {
        const leader = rev1 > rev2 ? AUTH_CONFIG.branches[b1].name : AUTH_CONFIG.branches[b2].name;
        const diff = Math.abs(pctChange(rev1, rev2));
        if (diff > 10) {
          result.push({ text: `${leader} is outperforming by ${diff}% in revenue.`, priority: 'MEDIUM' });
        }
      }
    }

    // Critical inventory
    if (metrics.criticalInventory > 0) {
      result.push({
        text: `${metrics.criticalInventory} inventory item${metrics.criticalInventory > 1 ? 's are' : ' is'} critically low.`,
        priority: metrics.criticalInventory >= 5 ? 'HIGH' : 'MEDIUM',
      });
    }

    // Inventory health
    if (metrics.inventoryHealth < 80) {
      result.push({ text: `Overall inventory health is at ${metrics.inventoryHealth}% — consider restocking.`, priority: 'HIGH' });
    }

    if (result.length === 0) {
      result.push({ text: 'All operations running smoothly across branches.', priority: 'LOW' });
    }

    return result.slice(0, 5);
  }, [metrics, branchData]);

  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const defaultBranch = Object.keys(AUTH_CONFIG.branches)[0] || 'branch2';

  return (
    <DashboardLayout branchId={defaultBranch}>
      <div style={{ padding: 'var(--space-6) var(--space-5)', maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div className="slide-up slide-up-d1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-7)' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: 'var(--color-text-primary)' }}>
              Admin Dashboard
            </h1>
            <p style={{ margin: 'var(--space-1) 0 0 0', fontSize: '0.88rem', color: 'var(--color-text-muted)' }}>
              {todayLabel} · Cross-branch executive summary
            </p>
          </div>
          <button
            onClick={() => navigate('/suppliers')}
            style={{
              padding: '10px 18px', borderRadius: 8, border: 'none',
              background: 'var(--color-accent)', color: '#fff',
              fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Manage Suppliers
          </button>
        </div>


        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>

        {/* KPI Grid */}
        <div className="slide-up slide-up-d2" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}>
          <KPICard
            icon={RevenueIcon}
            label="Combined Revenue"
            value={formatCurrency(metrics.totalRevenue)}
            subtitle={`Total branches combined`}
            accentColor="#16a085"
          />
          <KPICard
            icon={OrdersIcon}
            label="Total Orders"
            value={formatNumber(metrics.totalOrders)}
            subtitle={`Total branches combined`}
            accentColor="#3498db"
          />
          <KPICard
            icon={RevenueIcon}
            label="Avg Order Value"
            value={formatCurrency(metrics.avgOrderValue)}
            accentColor="#9b59b6"
          />
          <KPICard
            icon={InventoryIcon}
            label="Inventory Health"
            value={`${metrics.inventoryHealth}%`}
            subtitle={`${metrics.criticalInventory} critical · ${metrics.totalItems} total`}
            accentColor={metrics.inventoryHealth < 80 ? '#e74c3c' : '#27ae60'}
          />
        </div>

        {/* Charts + Insights Row */}
        <div className="slide-up slide-up-d3" style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 'var(--space-5)',
          marginBottom: 'var(--space-6)',
        }}>
          {/* Revenue Comparison Chart */}
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Revenue Comparison (7 Days)
              </h3>
            </div>
            {comparisonData.labels.length > 0 ? (
              <DualLineChart
                data1={comparisonData.datasets[Object.keys(AUTH_CONFIG.branches)[0]] || []}
                data2={Object.keys(AUTH_CONFIG.branches).length > 1 ? comparisonData.datasets[Object.keys(AUTH_CONFIG.branches)[1]] || [] : []}
                labels={comparisonData.labels}
                color1="#16a085"
                color2="#3498db"
                label1={AUTH_CONFIG.branches[Object.keys(AUTH_CONFIG.branches)[0]]?.name}
                label2={Object.keys(AUTH_CONFIG.branches).length > 1 ? AUTH_CONFIG.branches[Object.keys(AUTH_CONFIG.branches)[1]]?.name : ''}
                height={180}
                isCurrency={true}
              />
            ) : (
              <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                No revenue data available yet
              </div>
            )}
          </div>

          {/* AI Insights Panel */}
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <BotIcon size={18} color="var(--color-accent)" />
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                AI Intelligence
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {insights.map((insight, i) => (
                <InsightRow key={i} text={insight.text} priority={insight.priority} />
              ))}
            </div>
          </div>
        </div>

        {/* Operations Alerts */}
        <div className="slide-up slide-up-d4" style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-5)',
          marginBottom: 'var(--space-6)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <AlertIcon size={18} color="var(--color-warning)" />
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Operations Summary
            </h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
            <SeverityCounter label="Critical Inventory" count={metrics.criticalInventory} color="#e74c3c" />
            <SeverityCounter label="Items Monitored" count={metrics.totalItems} color="#f39c12" />
            <SeverityCounter label="Healthy Items" count={metrics.totalItems - metrics.criticalInventory} color="#27ae60" />
          </div>
        </div>

        {/* New Multi-Agent Operations UI */}
        <div className="slide-up slide-up-d4" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-5)',
          marginBottom: 'var(--space-6)',
        }}>
          <div style={{
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)',
          }}>
            <AdminApprovalPanel adminEmail={user?.email || 'admin@admin.com'} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <InboxFeed role="admin" />
            <NotificationCenter />
          </div>
        </div>

        {/* Branch Cards */}
        <div className="slide-up slide-up-d5" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-5)',
        }}>
          {Object.keys(AUTH_CONFIG.branches).map(branchId => (
             <BranchCard 
               key={branchId}
               label={AUTH_CONFIG.branches[branchId].name} 
               branchId={branchId} 
               data={branchData[branchId]} 
               navigate={navigate} 
             />
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
