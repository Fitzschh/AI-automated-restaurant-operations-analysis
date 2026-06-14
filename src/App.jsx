import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import MenuPage from './pages/MenuPage';
import AdminHomePage from './pages/AdminHomePage';
import BranchHomePage from './pages/BranchHomePage';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import AnalyticsHistoryPage from './pages/AnalyticsHistoryPage';
import InventoryPage from './pages/InventoryPage';
import AIUsagePage from './pages/AIUsagePage';
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
          path="/menu-branch1"
          element={
            <ProtectedRoute branchId="branch1">
              <MenuPage branchId="branch1" />
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
    </div>
  );
}
