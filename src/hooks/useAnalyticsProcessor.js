/**
 * useAnalyticsProcessor Hook
 * 
 * Real-time listener that detects new/completed orders and updates analytics
 * This hook should be used in the main app or BranchHomePage to ensure
 * analytics are updated whenever orders change
 * 
 * Features:
 * - Listens for order changes in real-time
 * - Processes each eligible order into persistent analytics once
 * - Keeps analytics independent from operational order log cleanup
 * - Initializes analytics structure if needed
 */

import { useEffect } from 'react';
import { database } from '../lib/firebase';
import { ref, onValue, off } from 'firebase/database';
import {
  initializeAnalytics,
  initializeProcessedOrderLedger,
  isAnalyticsOrder,
  processOrderAnalytics,
} from '../lib/analyticsApi';

/**
 * Hook to monitor orders and automatically update analytics
 * Should be called in a component that persists across branch navigation
 * 
 * @param {string} branchId - The branch ID to monitor
 * @param {boolean} enabled - Whether to enable the listener (default: true)
 */
export function useAnalyticsProcessor(branchId, enabled = true) {
  useEffect(() => {
    if (!branchId || !enabled) return;

    // Initialize analytics structure
    initializeAnalytics(branchId).catch(error => {
      console.error('Failed to initialize analytics:', error);
    });

    // Set up real-time listener for order logs. Logs are only the event source;
    // analytics writes persist separately under {branchId}/analytics.
    const logsRef = ref(database, `${branchId}/logs`);

    let isProcessing = false;
    let pendingSnapshot = null;
    let ledgerInitialized = false;

    const handleOrdersChange = async (snapshot) => {
      pendingSnapshot = snapshot.val() || {};
      if (isProcessing) return;

      try {
        isProcessing = true;
        while (pendingSnapshot) {
          const dataToProcess = pendingSnapshot;
          pendingSnapshot = null;

          if (!ledgerInitialized) {
            await initializeProcessedOrderLedger(branchId, dataToProcess);
            ledgerInitialized = true;
          }

          const orders = Object.entries(dataToProcess || {});
          for (const [orderId, orderData] of orders) {
            if (!isAnalyticsOrder(orderData)) continue;
            await processOrderAnalytics(branchId, orderId, orderData);
          }
        }
      } catch (error) {
        console.error('Error in analytics processor:', error);
      } finally {
        isProcessing = false;
      }
    };

    // Subscribe to order changes
    onValue(logsRef, handleOrdersChange);

    // Return cleanup function
    return () => {
      off(logsRef, 'value', handleOrdersChange);
    };
  }, [branchId, enabled]);
}

export default useAnalyticsProcessor;
