import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useLiveAnalyst } from './context/LiveAnalystProvider';
import LoginPage from './pages/LoginPage';
import MenuPage from './pages/MenuPage';
import AdminHomePage from './pages/AdminHomePage';
import BranchHomePage from './pages/BranchHomePage';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import AnalyticsHistoryPage from './pages/AnalyticsHistoryPage';
import InventoryPage from './pages/InventoryPage';
import AIUsagePage from './pages/AIUsagePage';
import SupplierManagementPage from './pages/SupplierManagementPage';
import AILiveNotificationBar from './components/analytics/AIFloatingChat';
import AIChatHead from './components/analytics/AIChatHead';
import ActionPlanToast from './components/analytics/ActionPlanToast';
import HackathonDemoSimulation from './components/simulation/HackathonDemoSimulation';
import { canAccessBranch, isUserAdmin } from './config/authConfig';

function ProtectedRoute({ children, adminOnly = false, branchId: staticBranchId }) {
  const { isAuthenticated, initialLoading, user } = useAuth();
  const params = useParams();
  const branchId = staticBranchId || params.branchId;

  if (initialLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}>
        <p>Initializing...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const userEmail = user?.email;

  if (isUserAdmin(userEmail)) {
    return children;
  }

  if (adminOnly) {
    return <Navigate to="/" replace />;
  }

  if (branchId) {
    if (!canAccessBranch(userEmail, branchId)) {
      console.log('Unauthorized branch access:', { user: userEmail, requested: branchId });
      return <Navigate to="/" replace />;
    }
  }

  return children;
}

/**
 * Session-level AI components rendered outside the Routes tree.
 * They persist across all page navigations and are only destroyed on logout.
 */
function SessionAIComponents() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  // Don't render on login page or when not authenticated
  if (!isAuthenticated || location.pathname === '/') return null;

  // Don't render on menu routes (menu pages handle their own UI)
  const isMenuRoute = location.pathname.includes('/menu/') || location.pathname.includes('/menu-branch');
  if (isMenuRoute) return null;

  return (
    <>
      <AILiveNotificationBar />
      <AIChatHead />
      <ActionPlanToast />
      <HackathonDemoSimulation />
    </>
  );
}

export default function App() {
  const location = useLocation();

  return (
    <div className="page-transition-wrapper">
      <Routes location={location}>
        <Route path="/" element={<LoginPage />} />
        <Route
          path="/home-admin"
          element={
            <ProtectedRoute adminOnly>
              <AdminHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers"
          element={
            <ProtectedRoute adminOnly>
              <SupplierManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/home/:branchId"
          element={
            <ProtectedRoute>
              <BranchHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/menu/:branchId"
          element={
            <ProtectedRoute>
              <MenuPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics/:branchId"
          element={
            <ProtectedRoute>
              <AnalyticsDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics-history/:branchId"
          element={
            <ProtectedRoute>
              <AnalyticsHistoryPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/menu-branch2"
          element={
            <ProtectedRoute branchId="branch2">
              <MenuPage branchId="branch2" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/:branchId"
          element={
            <ProtectedRoute>
              <InventoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ai-usage/:branchId"
          element={
            <ProtectedRoute>
              <AIUsagePage />
            </ProtectedRoute>
          }
        />
        <Route path="/menu" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Session-level AI: persists across all page navigation */}
      <SessionAIComponents />
    </div>
  );
}
