import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useInventoryProcessor } from '../../hooks/useInventoryProcessor';
import {
  formatDateKey,
  formatWeekKey,
  formatMonthKey,
  onAnalyticsChange,
} from '../../lib/analyticsApi';
import { onMenuAndInventoryChange } from '../../lib/inventoryApi';
import AILiveNotificationBar from '../analytics/AIFloatingChat';
import AIChatHead from '../analytics/AIChatHead';
import {
  TrendUpIcon,
  InventoryIcon,
  MenuBookIcon,
  LogoutIcon,
  DashboardIcon,
  BotIcon,
} from '../analytics/AnalyticsIcons';
import styles from './DashboardLayout.module.css';

const NAV_ITEMS = [
  { key: 'home', label: 'Dashboard', icon: DashboardIcon, pathFn: (b) => `/home/${b}` },
  { key: 'analytics', label: 'Analytics', icon: TrendUpIcon, pathFn: (b) => `/analytics/${b}` },
  { key: 'inventory', label: 'Inventory', icon: InventoryIcon, pathFn: (b) => `/inventory/${b}` },
  { key: 'menu', label: 'Menu Management', icon: MenuBookIcon, pathFn: (b) => `/menu/${b}` },
  { key: 'ai-usage', label: 'AI Usage', icon: BotIcon, pathFn: (b) => `/ai-usage/${b}` },
];

function getActiveKey(pathname) {
  if (pathname.includes('/analytics/') || pathname.includes('/analytics-history/')) return 'analytics';
  if (pathname.includes('/inventory/')) return 'inventory';
  if (pathname.includes('/menu/') || pathname.includes('/menu-branch')) return 'menu';
  if (pathname.includes('/ai-usage/')) return 'ai-usage';
  if (pathname.includes('/home/')) return 'home';
  return 'home';
}

function SunIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function DashboardLayout({ children, branchId: propBranchId }) {
  const { branchId: paramBranchId } = useParams();
  const branchId = propBranchId || paramBranchId || 'branch1';
  const navigate = useNavigate();
  const location = useLocation();
  const { user, nickname, nicknameLoaded, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [inventoryData, setInventoryData] = useState({});
  const [inventoryLoaded, setInventoryLoaded] = useState(false);

  useInventoryProcessor(branchId, true);

  const activeKey = getActiveKey(location.pathname);
  const currentKeys = useMemo(() => {
    const now = new Date();
    return {
      today: formatDateKey(now),
      week: formatWeekKey(now),
      month: formatMonthKey(now),
    };
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return undefined;
    return onAnalyticsChange(branchId, setAnalyticsData);
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return undefined;
    setInventoryLoaded(false);
    return onMenuAndInventoryChange(branchId, (data) => {
      setInventoryData(data);
      setInventoryLoaded(true);
    });
  }, [branchId]);

  const aiAnalyticsData = useMemo(() => {
    const daily = analyticsData?.daily || {};
    const weekly = analyticsData?.weekly || {};
    const monthly = analyticsData?.monthly || {};

    return {
      summary: analyticsData?.summary || {},
      products: analyticsData?.products || {},
      inventory: inventoryData,
      daily,
      hourly: analyticsData?.hourly || {},
      weekly,
      monthly,
      statistics: analyticsData?.statistics || {},
      todayAnalytics: daily?.[currentKeys.today] || { orders: 0, revenue: 0, averageOrderValue: 0 },
      weekAnalytics: weekly?.[currentKeys.week] || { orders: 0, revenue: 0 },
      monthAnalytics: monthly?.[currentKeys.month] || { orders: 0, revenue: 0 },
    };
  }, [analyticsData, currentKeys, inventoryData]);

  const handleNav = useCallback((item) => {
    const path = item.pathFn(branchId);
    navigate(path);
    setSidebarOpen(false);
  }, [branchId, navigate]);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/');
  }, [logout, navigate]);

  const displayName = nickname || user?.email?.split('@')[0] || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className={styles.layoutWrapper}>
      <div className={styles.mobileHeader}>
        <button
          className={styles.hamburgerBtn}
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <div className={styles.hamburgerLines}>
            <span className={styles.hamburgerLine} />
            <span className={styles.hamburgerLine} />
            <span className={styles.hamburgerLine} />
          </div>
        </button>
        <img
          src="/branding/touch-orders-icon-64.png"
          alt=""
          className={styles.mobileBrandIcon}
          aria-hidden="true"
        />
        <span className={styles.mobileBrand}>E-Menu Portal</span>
      </div>

      <div
        className={`${styles.overlay} ${sidebarOpen ? styles.visible : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.open : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.brandRow}>
            <div className={styles.brandIcon}>
              <img
                src="/branding/touch-orders-icon-64.png"
                alt=""
                className={styles.brandLogoMark}
                aria-hidden="true"
              />
            </div>
            <div>
              <p className={styles.brandName}>Touch Orders</p>
              <p className={styles.brandSub}>E-Menu Portal</p>
            </div>
          </div>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navGroup}>
            <div className={styles.navGroupLabel}>Main</div>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                className={`${styles.navItem} ${activeKey === item.key ? styles.active : ''}`}
                onClick={() => handleNav(item)}
              >
                <span className={styles.navIcon}>
                  <item.icon size={18} />
                </span>
                <span className={styles.navLabel}>{item.label}</span>
              </button>
            ))}
          </div>



          <div className={styles.navGroup}>
            <div className={styles.navGroupLabel}>Preferences</div>
            <button
              className={styles.navItem}
              onClick={toggleTheme}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              <span className={styles.navIcon}>
                {theme === 'light' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
              </span>
              <span className={styles.navLabel}>
                {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
              </span>
            </button>
          </div>
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userRow}>
            <div className={styles.userAvatar}>{initials}</div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{displayName}</div>
              <div className={styles.userRole}>Manager</div>
            </div>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            <LogoutIcon size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      <main className={styles.mainArea}>
        <div className={styles.mainContent}>
          {children}
        </div>
      </main>

      {!location.pathname.includes('/menu/') && !location.pathname.includes('/menu-branch') && (
        <>
          <AILiveNotificationBar
            analyticsData={aiAnalyticsData}
            branchId={branchId}
            managerNickname={nickname}
            nicknameLoaded={nicknameLoaded}
            inventoryLoaded={inventoryLoaded}
          />
          <AIChatHead analyticsData={aiAnalyticsData} branchId={branchId} />
        </>
      )}
    </div>
  );
}
