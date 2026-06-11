/**
 * useAnalyticsProcessor Hook
 * 
 * Real-time listener that detects new/completed orders and updates analytics
 * This hook should be used in the main app or BranchHomePage to ensure
 * analytics are updated whenever orders change
 * 
 * Features:
 * - Listens for order changes in real-time
 * - Automatically processes completed orders for analytics
 * - Prevents duplicate processing with analyticsProcessed flag
 * - Initializes analytics structure if needed
 */

import { useEffect } from 'react';
import { database } from '../lib/firebase';
import { ref, onValue, off } from 'firebase/database';
import { processOrderAnalytics, initializeAnalytics } from '../lib/analyticsApi';

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

    // Set up real-time listener for order logs
    const logsRef = ref(database, `${branchId}/logs`);

    let isProcessing = false;

    const handleOrdersChange = async (snapshot) => {
      // Prevent overlapping processing
      if (isProcessing) return;

      try {
        isProcessing = true;

        const data = snapshot.val();
        if (!data) {
          isProcessing = false;
          return;
        }

        // Process each order
        const orders = Object.entries(data);
        
        for (const [orderId, orderData] of orders) {
          // Only process completed orders
          const status = orderData.status || 'pending';
          if (status !== 'completed' && orderData.total === undefined && orderData.items === undefined) {
            // Skip if it looks like a completed order structure doesn't exist
            continue;
          }

          // Check if already processed
          if (orderData.analyticsProcessed === true) {
            // Already processed, skip
            continue;
          }

          // Process this order for analytics
          try {
            await processOrderAnalytics(branchId, orderId, orderData);
          } catch (error) {
            console.error(`Error processing order ${orderId} for analytics:`, error);
            // Continue with next order even if one fails
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
