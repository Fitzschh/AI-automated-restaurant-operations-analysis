import { useParams } from 'react-router-dom';
import DashboardLayout from '../components/layout/DashboardLayout';
import AIUsageDashboard from '../components/analytics/AIUsageDashboard';
import { AUTH_CONFIG } from '../config/authConfig';

export default function AIUsagePage() {
  const { branchId } = useParams();
  const branchName = AUTH_CONFIG.branches[branchId]?.name || branchId;

  return (
    <DashboardLayout branchId={branchId}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
          AI Usage & Cost Monitoring
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', margin: 'var(--space-1) 0 0 0' }}>
          Track AI requests, token consumption, and estimated costs for {branchName}.
        </p>
      </div>

      <AIUsageDashboard branchId={branchId} branchName={branchName} compactHeader />
    </DashboardLayout>
  );
}
