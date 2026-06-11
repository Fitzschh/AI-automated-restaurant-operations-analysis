/**
 * Firebase Realtime Database Analytics API
 * 
 * This module provides functions to:
 * 1. Update analytics data when orders are created/completed
 * 2. Fetch analytics data for dashboard display
 * 3. Calculate statistical summaries
 * 4. Prevent duplicate analytics processing
 * 
 * Database Structure:
 * {branchId}/analytics/
 *   ├── summary/ (total orders, revenue, averages)
 *   ├── products/ (per-item sales data)
 *   ├── hourly/ (orders and revenue by hour)
 *   ├── daily/ (orders and revenue by day)
 *   ├── weekly/ (orders and revenue by week)
 *   ├── monthly/ (orders and revenue by month)
 *   └── statistics/ (calculated means, medians, etc.)
 */

import { fetchWithAppCheck, dbUrl as baseDbUrl, database } from './firebase';
import { ref, get, update, runTransaction } from 'firebase/database';
import { calculateMean, calculateMedian, calculateMode } from './statisticsUtils';

/**
 * Helper to construct analytics paths
 */
function analyticsPath(branchId, path) {
  return `${branchId}/analytics${path ? '/' + path : ''}`;
}

/**
 * Initialize analytics structure for a business if it doesn't exist
 */
export async function initializeAnalytics(branchId) {
  try {
    const analyticsRef = ref(database, analyticsPath(branchId));
    const snapshot = await get(analyticsRef);
    
    if (!snapshot.exists()) {
      const initialAnalytics = {
        summary: {
          totalOrders: 0,
          totalRevenue: 0,
          averageOrderValue: 0,
          bestSellingItem: '',
          leastSellingItem: '',
          lastUpdated: new Date().toISOString(),
        },
        products: {},
        hourly: {},
        daily: {},
        weekly: {},
        monthly: {},
        statistics: {
          ordersPerDay: { mean: 0, median: 0, mode: 0 },
          revenuePerDay: { mean: 0, median: 0 },
        },
      };
      
      await fetchWithAppCheck(baseDbUrl(analyticsPath(branchId)), {
        method: 'PUT',
        body: JSON.stringify(initialAnalytics),
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error initializing analytics:', error);
  }
}

/**
 * Check if an order has already been processed for analytics
 */
async function isOrderAlreadyProcessed(branchId, orderId) {
  try {
    const orderRef = ref(database, `${branchId}/logs/${orderId}`);
    const snapshot = await get(orderRef);
    if (!snapshot.exists()) return false;
    const order = snapshot.val();
    return order.analyticsProcessed === true;
  } catch (error) {
    console.error('Error checking if order was processed:', error);
    return false;
  }
}

/**
 * Mark an order as processed for analytics
 */
async function markOrderAsProcessed(branchId, orderId) {
  try {
    await fetchWithAppCheck(baseDbUrl(`${branchId}/logs/${orderId}/analyticsProcessed`), {
      method: 'PUT',
      body: JSON.stringify(true),
      headers: { 'Content-Type': 'application/json' },
    });
    
    await fetchWithAppCheck(baseDbUrl(`${branchId}/logs/${orderId}/analyticsProcessedAt`), {
      method: 'PUT',
      body: JSON.stringify(new Date().toISOString()),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error marking order as processed:', error);
  }
}

/**
 * Format a date as YYYY-MM-DD
 */
export function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a date as YYYY-MM
 */
export function formatMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get ISO week key (e.g., "2026-W24")
 */
export function formatWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const weekString = String(weekNum).padStart(2, '0');
  return `${d.getUTCFullYear()}-W${weekString}`;
}

/**
 * Get hour key (0-23)
 */
export function formatHourKey(date) {
  return String(date.getHours()).padStart(2, '0');
}

/**
 * Process a single completed order and update analytics
 * This function uses transactions to ensure data consistency
 */
export async function processOrderAnalytics(branchId, orderId, orderData) {
  try {
    // Ensure analytics structure exists
    await initializeAnalytics(branchId);
    
    // Check if already processed
    const alreadyProcessed = await isOrderAlreadyProcessed(branchId, orderId);
    if (alreadyProcessed) {
      console.log(`Order ${orderId} already processed for analytics, skipping.`);
      return;
    }
    
    const orderDate = new Date(orderData.timestamp || Date.now());
    const dateKey = formatDateKey(orderDate);
    const monthKey = formatMonthKey(orderDate);
    const weekKey = formatWeekKey(orderDate);
    const hourKey = formatHourKey(orderDate);
    
    // Extract order values
    const orderTotal = Number(orderData.total || 0);
    const items = Array.isArray(orderData.items) ? orderData.items : Object.values(orderData.items || {});
    
    // Use transactions for atomic updates of counters
    const analyticsRef = ref(database, analyticsPath(branchId));
    
    await runTransaction(analyticsRef, (current) => {
      if (current === null) {
        return current;
      }
      
      // ===== Update Summary =====
      const summary = current.summary || {};
      summary.totalOrders = (summary.totalOrders || 0) + 1;
      summary.totalRevenue = Number(summary.totalRevenue || 0) + orderTotal;
      summary.averageOrderValue = summary.totalOrders > 0 
        ? Number((summary.totalRevenue / summary.totalOrders).toFixed(2))
        : 0;
      summary.lastUpdated = new Date().toISOString();
      
      // ===== Update Products =====
      const products = current.products || {};
      
      for (const item of items) {
        const itemId = item.itemId || item.name?.toLowerCase().replace(/\s+/g, '_');
        if (!itemId) continue;
        
        const itemSubtotal = Number(item.subtotal || (item.price * item.quantity) || 0);
        const itemQty = Number(item.quantity || 1);
        
        if (!products[itemId]) {
          products[itemId] = {
            name: item.name || itemId,
            quantitySold: 0,
            revenue: 0,
            orderCount: 0,
          };
        }
        
        products[itemId].quantitySold = (products[itemId].quantitySold || 0) + itemQty;
        products[itemId].revenue = Number((Number(products[itemId].revenue || 0) + itemSubtotal).toFixed(2));
        products[itemId].orderCount = (products[itemId].orderCount || 0) + 1;
      }
      
      // Find best and least selling items
      if (Object.keys(products).length > 0) {
        const productEntries = Object.entries(products);
        const bestSeller = productEntries.reduce((a, b) => 
          b[1].quantitySold > a[1].quantitySold ? b : a
        );
        const leastSeller = productEntries.reduce((a, b) => 
          b[1].quantitySold < a[1].quantitySold ? b : a
        );
        summary.bestSellingItem = bestSeller[0];
        summary.leastSellingItem = leastSeller[0];
      }
      
      // ===== Update Time-based Analytics =====
      
      // Hourly
      const hourly = current.hourly || {};
      if (!hourly[dateKey]) hourly[dateKey] = {};
      if (!hourly[dateKey][hourKey]) {
        hourly[dateKey][hourKey] = { orders: 0, revenue: 0 };
      }
      hourly[dateKey][hourKey].orders = (hourly[dateKey][hourKey].orders || 0) + 1;
      hourly[dateKey][hourKey].revenue = Number((Number(hourly[dateKey][hourKey].revenue || 0) + orderTotal).toFixed(2));
      
      // Daily
      const daily = current.daily || {};
      if (!daily[dateKey]) {
        daily[dateKey] = { orders: 0, revenue: 0, averageOrderValue: 0 };
      }
      daily[dateKey].orders = (daily[dateKey].orders || 0) + 1;
      daily[dateKey].revenue = Number((Number(daily[dateKey].revenue || 0) + orderTotal).toFixed(2));
      daily[dateKey].averageOrderValue = daily[dateKey].orders > 0
        ? Number((daily[dateKey].revenue / daily[dateKey].orders).toFixed(2))
        : 0;
      
      // Weekly
      const weekly = current.weekly || {};
      if (!weekly[weekKey]) {
        weekly[weekKey] = { orders: 0, revenue: 0 };
      }
      weekly[weekKey].orders = (weekly[weekKey].orders || 0) + 1;
      weekly[weekKey].revenue = Number((Number(weekly[weekKey].revenue || 0) + orderTotal).toFixed(2));
      
      // Monthly
      const monthly = current.monthly || {};
      if (!monthly[monthKey]) {
        monthly[monthKey] = { orders: 0, revenue: 0 };
      }
      monthly[monthKey].orders = (monthly[monthKey].orders || 0) + 1;
      monthly[monthKey].revenue = Number((Number(monthly[monthKey].revenue || 0) + orderTotal).toFixed(2));
      
      // ===== Update Statistics (calculate based on daily data) =====
      const statistics = current.statistics || { 
        ordersPerDay: { mean: 0, median: 0, mode: 0 },
        revenuePerDay: { mean: 0, median: 0 },
      };
      
      if (Object.keys(daily).length > 0) {
        const dailyOrders = Object.values(daily).map(d => d.orders);
        const dailyRevenues = Object.values(daily).map(d => d.revenue);
        
        statistics.ordersPerDay = {
          mean: Number(calculateMean(dailyOrders).toFixed(2)),
          median: Number(calculateMedian(dailyOrders).toFixed(2)),
          mode: calculateMode(dailyOrders),
        };
        
        statistics.revenuePerDay = {
          mean: Number(calculateMean(dailyRevenues).toFixed(2)),
          median: Number(calculateMedian(dailyRevenues).toFixed(2)),
        };
      }
      
      return {
        ...current,
        summary,
        products,
        hourly,
        daily,
        weekly,
        monthly,
        statistics,
      };
    });
    
    // Mark order as processed
    await markOrderAsProcessed(branchId, orderId);
    
    console.log(`Analytics updated for order ${orderId}`);
  } catch (error) {
    console.error('Error processing order analytics:', error);
    throw error;
  }
}

/**
 * Fetch current analytics summary for dashboard
 */
export async function getAnalyticsSummary(branchId) {
  try {
    const ref_db = ref(database, analyticsPath(branchId, 'summary'));
    const snapshot = await get(ref_db);
    
    if (!snapshot.exists()) {
      return {
        totalOrders: 0,
        totalRevenue: 0,
        averageOrderValue: 0,
        bestSellingItem: '',
        leastSellingItem: '',
        lastUpdated: '',
      };
    }
    
    return snapshot.val();
  } catch (error) {
    console.error('Error fetching analytics summary:', error);
    return {
      totalOrders: 0,
      totalRevenue: 0,
      averageOrderValue: 0,
      bestSellingItem: '',
      leastSellingItem: '',
      lastUpdated: '',
    };
  }
}

/**
 * Fetch products analytics
 */
export async function getProductsAnalytics(branchId) {
  try {
    const ref_db = ref(database, analyticsPath(branchId, 'products'));
    const snapshot = await get(ref_db);
    
    if (!snapshot.exists()) {
      return {};
    }
    
    return snapshot.val();
  } catch (error) {
    console.error('Error fetching products analytics:', error);
    return {};
  }
}

/**
 * Fetch daily analytics
 */
export async function getDailyAnalytics(branchId) {
  try {
    const ref_db = ref(database, analyticsPath(branchId, 'daily'));
    const snapshot = await get(ref_db);
    
    if (!snapshot.exists()) {
      return {};
    }
    
    return snapshot.val();
  } catch (error) {
    console.error('Error fetching daily analytics:', error);
    return {};
  }
}

/**
 * Fetch hourly analytics for a specific date
 */
export async function getHourlyAnalytics(branchId, dateKey) {
  try {
    const ref_db = ref(database, analyticsPath(branchId, `hourly/${dateKey}`));
    const snapshot = await get(ref_db);
    
    if (!snapshot.exists()) {
      return {};
    }
    
    return snapshot.val();
  } catch (error) {
    console.error('Error fetching hourly analytics:', error);
    return {};
  }
}

/**
 * Fetch weekly analytics
 */
export async function getWeeklyAnalytics(branchId) {
  try {
    const ref_db = ref(database, analyticsPath(branchId, 'weekly'));
    const snapshot = await get(ref_db);
    
    if (!snapshot.exists()) {
      return {};
    }
    
    return snapshot.val();
  } catch (error) {
    console.error('Error fetching weekly analytics:', error);
    return {};
  }
}

/**
 * Fetch monthly analytics
 */
export async function getMonthlyAnalytics(branchId) {
  try {
    const ref_db = ref(database, analyticsPath(branchId, 'monthly'));
    const snapshot = await get(ref_db);
    
    if (!snapshot.exists()) {
      return {};
    }
    
    return snapshot.val();
  } catch (error) {
    console.error('Error fetching monthly analytics:', error);
    return {};
  }
}

/**
 * Fetch statistics (calculated aggregates)
 */
export async function getStatistics(branchId) {
  try {
    const ref_db = ref(database, analyticsPath(branchId, 'statistics'));
    const snapshot = await get(ref_db);
    
    if (!snapshot.exists()) {
      return {
        ordersPerDay: { mean: 0, median: 0, mode: 0 },
        revenuePerDay: { mean: 0, median: 0 },
      };
    }
    
    return snapshot.val();
  } catch (error) {
    console.error('Error fetching statistics:', error);
    return {
      ordersPerDay: { mean: 0, median: 0, mode: 0 },
      revenuePerDay: { mean: 0, median: 0 },
    };
  }
}

/**
 * Get orders for today
 */
export async function getTodayAnalytics(branchId) {
  const today = formatDateKey(new Date());
  try {
    const ref_db = ref(database, analyticsPath(branchId, `daily/${today}`));
    const snapshot = await get(ref_db);
    
    if (!snapshot.exists()) {
      return { orders: 0, revenue: 0, averageOrderValue: 0 };
    }
    
    return snapshot.val();
  } catch (error) {
    console.error('Error fetching today analytics:', error);
    return { orders: 0, revenue: 0, averageOrderValue: 0 };
  }
}

/**
 * Get week number from date
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Get current week's analytics
 */
export async function getCurrentWeekAnalytics(branchId) {
  const weekKey = formatWeekKey(new Date());
  try {
    const ref_db = ref(database, analyticsPath(branchId, `weekly/${weekKey}`));
    const snapshot = await get(ref_db);
    
    if (!snapshot.exists()) {
      return { orders: 0, revenue: 0 };
    }
    
    return snapshot.val();
  } catch (error) {
    console.error('Error fetching current week analytics:', error);
    return { orders: 0, revenue: 0 };
  }
}

/**
 * Get current month's analytics
 */
export async function getCurrentMonthAnalytics(branchId) {
  const monthKey = formatMonthKey(new Date());
  try {
    const ref_db = ref(database, analyticsPath(branchId, `monthly/${monthKey}`));
    const snapshot = await get(ref_db);
    
    if (!snapshot.exists()) {
      return { orders: 0, revenue: 0 };
    }
    
    return snapshot.val();
  } catch (error) {
    console.error('Error fetching current month analytics:', error);
    return { orders: 0, revenue: 0 };
  }
}

/**
 * Real-time listener for analytics summary
 */
import { onValue, off } from 'firebase/database';

export function onAnalyticsSummaryChange(branchId, callback) {
  const summaryRef = ref(database, analyticsPath(branchId, 'summary'));
  const handler = (snapshot) => {
    callback(snapshot.val() || {
      totalOrders: 0,
      totalRevenue: 0,
      averageOrderValue: 0,
      bestSellingItem: '',
      leastSellingItem: '',
      lastUpdated: '',
    });
  };
  onValue(summaryRef, handler);
  return () => off(summaryRef, 'value', handler);
}

/**
 * Real-time listener for products analytics
 */
export function onProductsAnalyticsChange(branchId, callback) {
  const productsRef = ref(database, analyticsPath(branchId, 'products'));
  const handler = (snapshot) => {
    callback(snapshot.val() || {});
  };
  onValue(productsRef, handler);
  return () => off(productsRef, 'value', handler);
}

/**
 * Real-time listener for daily analytics
 */
export function onDailyAnalyticsChange(branchId, callback) {
  const dailyRef = ref(database, analyticsPath(branchId, 'daily'));
  const handler = (snapshot) => {
    callback(snapshot.val() || {});
  };
  onValue(dailyRef, handler);
  return () => off(dailyRef, 'value', handler);
}
