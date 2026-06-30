/**
 * Hourly Comparison Engine
 *
 * Computes hour-over-hour deltas between two snapshots of operational data.
 * Generates human-readable comparison insights used in hourly analysis cycles.
 *
 * Input:  Two snapshots of { revenue, orders, products, inventory }
 * Output: { revenueChange, orderChange, demandSpikes, depletionChanges, insights[] }
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

function pctChange(current, previous) {
  if (!previous || previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function formatPct(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}%`;
}

function formatProductName(raw) {
  return String(raw || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ─── Demand Spike Detection ─────────────────────────────────────────────────

/**
 * Compare product sales between two snapshots and detect demand spikes.
 * A spike is defined as a >20% increase in quantity sold.
 *
 * @param {object} currentProducts  - { [id]: { quantitySold, name, ... } }
 * @param {object} previousProducts - { [id]: { quantitySold, name, ... } }
 * @returns {Array<{ itemName, previousQty, currentQty, change }>}
 */
function detectDemandSpikes(currentProducts, previousProducts) {
  const spikes = [];
  if (!currentProducts || !previousProducts) return spikes;

  for (const [id, curr] of Object.entries(currentProducts)) {
    const prev = previousProducts[id];
    if (!prev) continue;

    const currQty = Number(curr.quantitySold || 0);
    const prevQty = Number(prev.quantitySold || 0);

    if (prevQty > 0 && currQty > prevQty) {
      const change = pctChange(currQty, prevQty);
      if (change >= 20) {
        spikes.push({
          itemName: formatProductName(curr.name || curr.productName || id),
          previousQty: prevQty,
          currentQty: currQty,
          change,
        });
      }
    }
  }

  return spikes.sort((a, b) => b.change - a.change);
}

// ─── Inventory Depletion Rate Changes ───────────────────────────────────────

/**
 * Detect changes in inventory depletion rates.
 *
 * @param {object} currentInventory  - { [id]: { stock, ... } }
 * @param {object} previousInventory - { [id]: { stock, ... } }
 * @returns {Array<{ itemName, previousStock, currentStock, depleted, change }>}
 */
function detectDepletionChanges(currentInventory, previousInventory) {
  const changes = [];
  if (!currentInventory || !previousInventory) return changes;

  for (const [id, curr] of Object.entries(currentInventory)) {
    const prev = previousInventory[id];
    if (!prev) continue;

    const currStock = Number(curr.stock ?? curr.currentStock ?? 0);
    const prevStock = Number(prev.stock ?? prev.currentStock ?? 0);

    if (prevStock > 0) {
      const depleted = prevStock - currStock;
      if (depleted > 0) {
        const depletionRate = Math.round((depleted / prevStock) * 100);
        if (depletionRate >= 10) {
          changes.push({
            itemName: formatProductName(curr.productName || curr.name || id),
            previousStock: prevStock,
            currentStock: Math.max(0, currStock),
            depleted,
            change: depletionRate,
          });
        }
      }
    }
  }

  return changes.sort((a, b) => b.change - a.change);
}

// ─── Unusual Pattern Detection ──────────────────────────────────────────────

/**
 * Detect unusual operational patterns such as sudden revenue drops
 * or order volume anomalies.
 *
 * @param {object} current  - { revenue, orders }
 * @param {object} previous - { revenue, orders }
 * @returns {string[]}
 */
function detectUnusualPatterns(current, previous) {
  const patterns = [];

  const revenueChange = pctChange(current.revenue, previous.revenue);
  const orderChange = pctChange(current.orders, previous.orders);

  // Revenue dropped but orders increased → lower avg order value
  if (revenueChange < -5 && orderChange > 5) {
    patterns.push('Revenue declined despite increased order volume — average order value may be dropping.');
  }

  // Revenue spiked but orders flat → higher avg order value
  if (revenueChange > 15 && Math.abs(orderChange) < 5) {
    patterns.push('Revenue growth with stable order count — customers are spending more per order.');
  }

  // Both dropped significantly
  if (revenueChange < -15 && orderChange < -15) {
    patterns.push('Significant decline in both revenue and order volume — potential operational issue.');
  }

  // Orders spiked → possible rush period
  if (orderChange > 30) {
    patterns.push('Order volume surged — rush period may be underway.');
  }

  return patterns;
}

// ─── Main Comparison Function ───────────────────────────────────────────────

/**
 * Compute a full hourly comparison between two operational snapshots.
 *
 * @param {object} currentData  - { revenue, orders, products, inventory }
 * @param {object} previousData - { revenue, orders, products, inventory }
 * @returns {object} comparison result with human-readable insights
 */
export function computeHourlyComparison(currentData, previousData) {
  if (!currentData || !previousData) {
    return {
      revenueChange: 0,
      orderChange: 0,
      demandSpikes: [],
      depletionChanges: [],
      unusualPatterns: [],
      insights: [],
      hasPreviousData: false,
    };
  }

  const currRevenue = Number(currentData.revenue || 0);
  const prevRevenue = Number(previousData.revenue || 0);
  const currOrders = Number(currentData.orders || 0);
  const prevOrders = Number(previousData.orders || 0);

  const revenueChange = pctChange(currRevenue, prevRevenue);
  const orderChange = pctChange(currOrders, prevOrders);

  const demandSpikes = detectDemandSpikes(
    currentData.products,
    previousData.products
  );

  const depletionChanges = detectDepletionChanges(
    currentData.inventory,
    previousData.inventory
  );

  const unusualPatterns = detectUnusualPatterns(
    { revenue: currRevenue, orders: currOrders },
    { revenue: prevRevenue, orders: prevOrders }
  );

  // Build human-readable insights array
  const insights = [];

  if (Math.abs(revenueChange) >= 3) {
    const direction = revenueChange > 0 ? 'increased' : 'decreased';
    insights.push(`Revenue ${direction} by ${Math.abs(revenueChange)}% compared to previous hour.`);
  }

  if (Math.abs(orderChange) >= 5) {
    const direction = orderChange > 0 ? 'increased' : 'decreased';
    insights.push(`Order volume ${direction} by ${Math.abs(orderChange)}% compared to previous hour.`);
  }

  demandSpikes.slice(0, 3).forEach((spike) => {
    insights.push(`${spike.itemName} demand increased ${spike.change}% compared to previous hour.`);
  });

  depletionChanges.slice(0, 3).forEach((change) => {
    insights.push(`${change.itemName} inventory depletion rate: ${change.change}% of stock consumed this hour.`);
  });

  unusualPatterns.forEach((pattern) => {
    insights.push(pattern);
  });

  if (insights.length === 0) {
    insights.push('Operations are steady — no significant changes from the previous hour.');
  }

  return {
    revenueChange,
    orderChange,
    revenueFormatted: formatPct(revenueChange),
    orderFormatted: formatPct(orderChange),
    demandSpikes,
    depletionChanges,
    unusualPatterns,
    insights,
    hasPreviousData: true,
    currentSnapshot: {
      revenue: currRevenue,
      orders: currOrders,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Take a snapshot of the current operational state for later comparison.
 *
 * @param {object} analyticsData - Full analytics data from Firebase
 * @param {object} inventoryData - Current inventory state
 * @returns {object} Lightweight snapshot for comparison
 */
export function takeOperationalSnapshot(analyticsData, inventoryData) {
  const summary = analyticsData?.summary || {};
  const todayKey = (() => {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
  })();

  const hourKey = String(new Date().getHours());
  const hourlyToday = analyticsData?.hourly?.[todayKey] || {};

  // Accumulate revenue/orders up to current hour
  let accRevenue = 0;
  let accOrders = 0;
  for (const [h, data] of Object.entries(hourlyToday)) {
    if (Number(h) <= Number(hourKey)) {
      accRevenue += Number(data.revenue || 0);
      accOrders += Number(data.orders || 0);
    }
  }

  return {
    revenue: accRevenue || Number(summary.totalRevenue || 0),
    orders: accOrders || Number(summary.totalOrders || 0),
    products: { ...(analyticsData?.products || {}) },
    inventory: { ...(inventoryData || {}) },
    hour: Number(hourKey),
    timestamp: new Date().toISOString(),
  };
}
