import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getInventory, adjustStock } from '../../lib/inventoryApi';
import { isUserAdmin } from '../../config/authConfig';

const SIMULATION_ITEM_KEY = 'beef-patty';
const SIMULATION_BRANCH = 'branch2';

export default function HackathonDemoSimulation() {
  const { isAuthenticated, user } = useAuth();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Check if we already ran in this session
    if (sessionStorage.getItem('hackathon_demo_run')) {
      return;
    }

    let timeouts = [];

    const startSim = () => {
      sessionStorage.setItem('hackathon_demo_run', 'true');
      
      // Step 1: Issue detected by AI
      timeouts.push(setTimeout(() => {
        setStep(1);
        setVisible(true);
      }, 10000)); // 10s after login

      // Step 2: Manager Approval
      timeouts.push(setTimeout(() => {
        setStep(2);
      }, 14000)); 

      // Step 3: Admin Approval
      timeouts.push(setTimeout(() => {
        setStep(3);
      }, 18000)); 

      // Step 4: UiPath Started
      timeouts.push(setTimeout(() => {
        setStep(4);
      }, 22000)); 

      // Step 5: Supplier Processing
      timeouts.push(setTimeout(() => {
        setStep(5);
      }, 25000)); 

      // Step 6: Restock + Complete
      timeouts.push(setTimeout(async () => {
        try {
          // Increase inventory by 50
          const inv = await getInventory(SIMULATION_BRANCH);
          const current = inv?.[SIMULATION_ITEM_KEY]?.stock || 0;
          await adjustStock(SIMULATION_BRANCH, SIMULATION_ITEM_KEY, 50, current, current + 50, user?.email || 'system', 'Hackathon Automation');
        } catch (e) {
          console.error("Simulation restock failed", e);
        }
        setStep(6);
      }, 29000)); 

      // Hide after completion
      timeouts.push(setTimeout(() => {
        setVisible(false);
      }, 34000)); 
    };

    startSim();

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [isAuthenticated]);

  if (!visible || step === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 99999,
      background: 'var(--color-bg-elevated, #fff)',
      border: '1px solid var(--color-border)',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      padding: '20px',
      width: '400px',
      fontFamily: 'inherit'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-accent)', fontWeight: 800, textTransform: 'uppercase' }}>
          Hackathon Demo Mode
        </h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Auto-Simulation</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
        {step >= 1 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <span style={{ color: '#e74c3c' }}>🤖</span>
            <span><strong>Live Analyst:</strong> Critical stock depletion detected for Beef Patties.</span>
          </div>
        )}
        
        {step >= 2 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <span style={{ color: '#f39c12' }}>👨‍💼</span>
            <span><strong>Manager Review:</strong> Action plan approved. Restock 50 units.</span>
          </div>
        )}

        {step >= 3 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <span style={{ color: '#9b59b6' }}>👑</span>
            <span><strong>Admin Review:</strong> Expense approved. Forwarding to automation.</span>
          </div>
        )}

        {step >= 4 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <span style={{ color: '#3498db' }}>⚙️</span>
            <span><strong>UiPath Maestro:</strong> Job triggered successfully.</span>
          </div>
        )}

        {step >= 5 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <span style={{ color: '#16a085' }}>📧</span>
            <span><strong>Supplier:</strong> Purchase order processed. Delivery en route.</span>
          </div>
        )}

        {step >= 6 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', background: 'rgba(39, 174, 96, 0.1)', padding: '8px', borderRadius: '6px' }}>
            <span style={{ color: '#27ae60' }}>✓</span>
            <strong style={{ color: '#27ae60' }}>UiPath automation completed successfully. Inventory has been restocked.</strong>
          </div>
        )}
      </div>
    </div>
  );
}
