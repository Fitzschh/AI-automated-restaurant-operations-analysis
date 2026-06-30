/**
 * Live Operations Analyst Agent
 *
 * Runs real-time analysis on live operational data.
 * Produces inventory depletion predictions based on current stock
 * levels and sales velocity.
 *
 * Responsibilities:
 *   - Compute sales velocity per item (units/hour)
 *   - Predict when each item will be depleted
 *   - Produce structured prediction output
 *   - Continuously update predictions as new data arrives
 *
 * Does NOT:
 *   - Make business decisions
 *   - Classify severity
 *   - Generate action plans
 *   - Trigger automated workflows
 */

import { AgentType, validateLiveAnalystOutput } from './agentEventSchemas';

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeItemKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

function formatProductName(raw) {
  return String(raw || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

/**
 * Compute the sales velocity (units sold per hour) for a given item
 * using today's hourly analytics data.
 *
 * Strategy: weighted average of today's hourly data. If today has
 * fewer than 2 hours of data, fall back to the average across the
 * last 3 days of daily data.
 *
 * @param {string} itemId
 * @param {object} products    - { [itemId]: { quantitySold, orderCount, ... } }
 * @param {object} hourlyData  - { [dateKey]: { [hourKey]: { orders, revenue } } }
 * @param {object} dailyData   - { [dateKey]: { orders, revenue } }
 * @returns {number} units per hour (>= 0)
 */
function computeSalesVelocity(itemId, products, hourlyData, dailyData) {
  const product = products[itemId];
  if (!product || !product.quantitySold || product.quantitySold <= 0) {
    return 0;
  }

  const now = new Date();
  const todayKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');

  // Try today's hourly data first
  const todayHourly = hourlyData?.[todayKey];
  if (todayHourly) {
    const hourKeys = Object.keys(todayHourly).sort();
    if (hourKeys.length >= 2) {
      const firstHour = parseInt(hourKeys[0], 10);
      const lastHour = parseInt(hourKeys[hourKeys.length - 1], 10);
      const hoursSpan = Math.max(1, lastHour - firstHour + 1);
      const totalOrders = hourKeys.reduce((sum, h) => sum + (todayHourly[h]?.orders || 0), 0);

      if (totalOrders > 0) {
        // Proportion this item's sales relative to total orders
        const totalAllProducts = Object.values(products).reduce(
          (sum, p) => sum + (p.quantitySold || 0), 0
        );
        const itemProportion = totalAllProducts > 0
          ? product.quantitySold / totalAllProducts
          : 0;

        // Estimate item-level velocity from order-level hourly
        return (totalOrders * itemProportion) / hoursSpan;
      }
    }
  }

  // Fallback: use daily data over last 3 days
  const dailyKeys = Object.keys(dailyData || {}).sort().reverse().slice(0, 3);
  if (dailyKeys.length > 0) {
    const totalDays = dailyKeys.length;
    const totalOrders = dailyKeys.reduce((sum, dk) => sum + (dailyData[dk]?.orders || 0), 0);

    if (totalOrders > 0) {
      const totalAllProducts = Object.values(products).reduce(
        (sum, p) => sum + (p.quantitySold || 0), 0
      );
      const itemProportion = totalAllProducts > 0
        ? product.quantitySold / totalAllProducts
        : 0;

      // Assume ~12 operational hours per day
      const operationalHours = totalDays * 12;
      return (totalOrders * itemProportion) / operationalHours;
    }
  }

  return 0;
}

/**
 * Format estimated hours into a human-readable prediction string.
 *
 * @param {string} itemName
 * @param {number} hoursRemaining
 * @returns {string}
 */
function formatPredictionText(itemName, hoursRemaining) {
  if (hoursRemaining <= 0) {
    return `${itemName} is currently out of stock`;
  }
  if (hoursRemaining < 1) {
    const minutes = Math.round(hoursRemaining * 60);
    return `${itemName} will last approximately ${minutes} minutes`;
  }
  if (hoursRemaining < 2) {
    return `${itemName} will last approximately 1 hour`;
  }
  const rounded = Math.round(hoursRemaining);
  return `${itemName} will last approximately ${rounded} hours`;
}

/**
 * Generate an operational note summarizing the current situation.
 *
 * @param {Array} predictions
 * @param {object} hourlyData
 * @returns {string}
 */
function generateOperationalNote(predictions, hourlyData) {
  const urgent = predictions.filter((p) => p.estimatedHoursRemaining < 2);
  const warning = predictions.filter((p) =>
    p.estimatedHoursRemaining >= 2 && p.estimatedHoursRemaining <= 4
  );

  const parts = [];

  if (urgent.length > 0) {
    const names = urgent.map((p) => p.itemName).join(', ');
    parts.push(`Critical inventory: ${names} approaching depletion`);
  }

  if (warning.length > 0) {
    const names = warning.map((p) => p.itemName).join(', ');
    parts.push(`Watch list: ${names} may need restocking within 4 hours`);
  }

  // Check for peak hour context
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 11 && hour <= 13) {
    parts.push('Lunch rush period active');
  } else if (hour >= 17 && hour <= 19) {
    parts.push('Dinner rush period active');
  }

  if (parts.length === 0) {
    parts.push('All inventory levels are within normal operating range');
  }

  return parts.join('. ') + '.';
}

// ─── Main Analysis Function ────────────────────────────────────────────────

/**
 * Produce inventory depletion predictions for all tracked items.
 *
 * @param {object} inventoryData - { [itemId]: { productName, stock, ... } }
 * @param {object} products      - { [itemId]: { quantitySold, orderCount, ... } }
 * @param {object} hourlyData    - { [dateKey]: { [hourKey]: { orders, revenue } } }
 * @param {object} dailyData     - { [dateKey]: { orders, revenue } }
 * @param {string} branchId
 * @returns {object} Validated Live Analyst output
 */
export function computeDepletionPredictions(inventoryData, products, hourlyData, dailyData, branchId) {
  const predictions = [];

  const entries = Object.entries(inventoryData || {});
  for (const [itemId, invRecord] of entries) {
    const stock = Number(invRecord.stock ?? invRecord.currentStock ?? 0);
    const itemName = formatProductName(invRecord.productName || invRecord.name || itemId);
    const itemKey = normalizeItemKey(itemId);

    const velocity = computeSalesVelocity(itemId, products || {}, hourlyData || {}, dailyData || {});

    let estimatedHoursRemaining;
    if (stock <= 0) {
      estimatedHoursRemaining = 0;
    } else if (velocity <= 0) {
      // No sales velocity — stock will last indefinitely (cap at 999)
      estimatedHoursRemaining = 999;
    } else {
      estimatedHoursRemaining = Math.round((stock / velocity) * 10) / 10;
    }

    predictions.push({
      itemKey,
      itemName,
      currentStock: Math.max(0, stock),
      salesVelocityPerHour: Math.round(velocity * 100) / 100,
      estimatedHoursRemaining,
      prediction: formatPredictionText(itemName, estimatedHoursRemaining),
    });
  }

  // Sort: most urgent first
  predictions.sort((a, b) => a.estimatedHoursRemaining - b.estimatedHoursRemaining);

  const output = {
    agentType: AgentType.LIVE_OPERATIONS_ANALYST,
    timestamp: new Date().toISOString(),
    branchId: branchId || '',
    predictions,
    operationalNote: generateOperationalNote(predictions, hourlyData),
  };

  // Validate before returning
  const validation = validateLiveAnalystOutput(output);
  if (!validation.valid) {
    console.error('[Live Operations Analyst] Output validation failed:', validation.errors);
  }

  return output;
}

/**
 * Convenience: extract only the predictions that have changed since the
 * last output. Useful for incremental updates to avoid re-processing
 * items whose stock and velocity haven't changed.
 *
 * @param {object} currentOutput  - Latest computeDepletionPredictions result
 * @param {Map}    previousPreds  - Previous predictions map (itemKey → prediction)
 * @returns {Array} predictions that changed
 */
export function getChangedPredictions(currentOutput, previousPreds) {
  if (!previousPreds || previousPreds.size === 0) {
    return currentOutput.predictions;
  }

  return currentOutput.predictions.filter((pred) => {
    const prev = previousPreds.get(pred.itemKey);
    if (!prev) return true;
    return (
      prev.currentStock !== pred.currentStock ||
      Math.abs(prev.salesVelocityPerHour - pred.salesVelocityPerHour) > 0.1 ||
      Math.abs(prev.estimatedHoursRemaining - pred.estimatedHoursRemaining) > 0.5
    );
  });
}
