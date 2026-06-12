import { ref, get, set, update, push, onValue, off, runTransaction } from 'firebase/database';
import { database } from './firebase';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert any stock-like value to a finite non-negative number.
 * Inventory cannot go below zero; invalid or negative values clamp to 0.
 */
export function normalizeStockValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, numeric);
}

/**
 * Read stock from an inventory record.
 * Supports both `stock` (new) and `currentStock` (legacy) fields.
 */
export function readStock(invRecord) {
  if (!invRecord) return 0;
  if (typeof invRecord.stock === 'number') return normalizeStockValue(invRecord.stock);
  if (typeof invRecord.currentStock === 'number') return normalizeStockValue(invRecord.currentStock);
  if (typeof invRecord.stock === 'string' && invRecord.stock.trim() !== '') return normalizeStockValue(invRecord.stock);
  if (typeof invRecord.currentStock === 'string' && invRecord.currentStock.trim() !== '') return normalizeStockValue(invRecord.currentStock);
  return 0;
}

function normalizeItemName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeItemKey(value) {
  return normalizeItemName(value).replace(/\s+/g, '-');
}

function getOrderItemIdCandidates(item) {
  return [
    item?.itemId,
    item?.menuItemId,
    item?.productId,
    item?.id,
    item?.key,
  ]
    .filter(Boolean)
    .map(String);
}

function resolveInventoryItemId(item, inventoryData, menuItems) {
  const idCandidates = getOrderItemIdCandidates(item);

  for (const candidate of idCandidates) {
    if (inventoryData?.[candidate] || menuItems?.[candidate]) return candidate;
  }

  for (const candidate of idCandidates) {
    const normalizedCandidate = normalizeItemKey(candidate);
    const inventoryMatch = Object.keys(inventoryData || {}).find((itemId) => (
      normalizeItemKey(itemId) === normalizedCandidate
    ));
    if (inventoryMatch) return inventoryMatch;

    const menuMatch = Object.keys(menuItems || {}).find((itemId) => (
      normalizeItemKey(itemId) === normalizedCandidate
    ));
    if (menuMatch) return menuMatch;
  }

  const normalizedName = normalizeItemName(item?.name || item?.productName || item?.title);
  if (!normalizedName) return null;

  const inventoryNameMatch = Object.entries(inventoryData || {}).find(([itemId, inv]) => (
    normalizeItemName(inv?.productName || inv?.name || itemId) === normalizedName
  ));
  if (inventoryNameMatch) return inventoryNameMatch[0];

  const menuNameMatch = Object.entries(menuItems || {}).find(([itemId, menuItem]) => (
    normalizeItemName(menuItem?.name || itemId) === normalizedName
  ));
  if (menuNameMatch) return menuNameMatch[0];

  return normalizeItemKey(normalizedName);
}

// ─── Core CRUD ──────────────────────────────────────────────────────────────

/**
 * Fetch all inventory items for a branch
 */
export async function getInventory(branchId) {
  const inventoryRef = ref(database, `${branchId}/inventory`);
  const snapshot = await get(inventoryRef);
  return snapshot.exists() ? snapshot.val() : {};
}

/**
 * Real-time listener for inventory changes
 */
export function onInventoryChange(branchId, callback) {
  const inventoryRef = ref(database, `${branchId}/inventory`);
  const handler = (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : {});
  };
  onValue(inventoryRef, handler);
  return () => off(inventoryRef, 'value', handler);
}

/**
 * Update fields on an inventory item (thresholds, unit, etc.)
 */
export async function updateInventoryItem(branchId, itemId, data) {
  const itemRef = ref(database, `${branchId}/inventory/${itemId}`);
  const safeData = { ...data };

  if ('stock' in safeData) {
    safeData.stock = normalizeStockValue(safeData.stock);
  }
  if ('currentStock' in safeData) {
    safeData.currentStock = normalizeStockValue(safeData.currentStock);
  }

  await update(itemRef, {
    ...safeData,
    lastUpdated: new Date().toISOString()
  });
  return true;
}

/**
 * Log a stock adjustment to history
 */
export async function addInventoryHistoryEntry(branchId, itemId, entry) {
  const historyRef = ref(database, `${branchId}/inventoryHistory/${itemId}`);
  const newEntryRef = push(historyRef);

  await set(newEntryRef, {
    ...entry,
    timestamp: new Date().getTime()
  });
  return true;
}

/**
 * Adjust stock level (increment, decrement, or set exact)
 * Also logs the adjustment to history.
 * After adjusting, syncs menu availability.
 */
export async function adjustStock(branchId, itemId, adjustment, previousStock, newStock, userId, note = '') {
  const safePreviousStock = normalizeStockValue(previousStock);
  const safeNewStock = normalizeStockValue(newStock);
  const safeAdjustment = safeNewStock - safePreviousStock;

  // Update current stock (write both fields for compat)
  const itemRef = ref(database, `${branchId}/inventory/${itemId}`);
  await update(itemRef, {
    stock: safeNewStock,
    currentStock: safeNewStock,
    lastUpdated: new Date().toISOString(),
    lastModifiedBy: userId || 'unknown'
  });

  // Determine adjustment type
  let type = 'adjustment';
  if (safeAdjustment > 0) type = 'increase';
  if (safeAdjustment < 0) type = 'decrease';

  // Log to history
  await addInventoryHistoryEntry(branchId, itemId, {
    type,
    quantity: Math.abs(safeAdjustment),
    previousStock: safePreviousStock,
    newStock: safeNewStock,
    userId: userId || 'unknown',
    note
  });

  // Sync menu availability based on new stock
  await syncMenuAvailability(branchId, itemId, safeNewStock);

  return true;
}

/**
 * Fetch history for a specific item
 */
export async function getInventoryHistory(branchId, itemId) {
  const historyRef = ref(database, `${branchId}/inventoryHistory/${itemId}`);
  const snapshot = await get(historyRef);
  return snapshot.exists() ? snapshot.val() : {};
}

// ─── Menu + Inventory Merged Listener (PART 1) ─────────────────────────────

/**
 * Gather all menu items from all categories.
 * Returns { [itemId]: { name, price, available, category, ... } }
 */
export function extractMenuItems(categoriesData) {
  const items = {};
  if (!categoriesData) return items;

  Object.entries(categoriesData).forEach(([catName, catData]) => {
    if (!catData || typeof catData !== 'object') return;
    Object.entries(catData).forEach(([key, value]) => {
      // Skip metadata keys
      if (key.startsWith('_')) return;
      if (value && typeof value === 'object' && value.name) {
        items[key] = { ...value, _category: catName };
      }
    });
  });

  return items;
}

/**
 * Real-time listener that merges menu items with inventory data.
 * Every menu item automatically appears in the result with stock defaulting to 1.
 *
 * Callback receives: { [itemId]: { productName, stock, category, ...inventoryFields } }
 */
export function onMenuAndInventoryChange(branchId, callback) {
  const catRef = ref(database, `${branchId}/categories`);
  const invRef = ref(database, `${branchId}/inventory`);

  let latestCategories = null;
  let latestInventory = null;
  let hasReceivedCategories = false;
  let hasReceivedInventory = false;

  function merge() {
    if (!hasReceivedCategories || !hasReceivedInventory) return;

    const menuItems = extractMenuItems(latestCategories);
    const merged = {};

    // For every menu item, create a merged entry
    Object.entries(menuItems).forEach(([itemId, menuData]) => {
      const inv = latestInventory?.[itemId] || {};
      merged[itemId] = {
        productName: menuData.name || itemId,
        stock: latestInventory?.[itemId] ? readStock(inv) : 1,
        currentStock: latestInventory?.[itemId] ? readStock(inv) : 1, // backward compat
        warningLevel: inv.warningLevel || 10,
        criticalLevel: inv.criticalLevel || 5,
        unit: inv.unit || 'units',
        lastUpdated: inv.lastUpdated || null,
        lastModifiedBy: inv.lastModifiedBy || null,
        _category: menuData._category,
        _menuAvailable: menuData.available,
        _menuPrice: menuData.price,
      };
    });

    callback(merged);
  }

  const catHandler = (snapshot) => {
    latestCategories = snapshot.exists() ? snapshot.val() : null;
    hasReceivedCategories = true;
    merge();
  };

  const invHandler = (snapshot) => {
    latestInventory = snapshot.exists() ? snapshot.val() : null;
    hasReceivedInventory = true;
    merge();
  };

  onValue(catRef, catHandler);
  onValue(invRef, invHandler);

  return () => {
    off(catRef, 'value', catHandler);
    off(invRef, 'value', invHandler);
  };
}

/**
 * Sync inventory with menu categories.
 * Creates default inventory entries (stock: 1) for any menu items
 * that don't have an inventory record yet.
 */
export async function syncInventoryWithMenu(branchId, userId, options = {}) {
  const { syncAvailability = true } = options;
  const categoriesRef = ref(database, `${branchId}/categories`);
  const inventoryRef = ref(database, `${branchId}/inventory`);

  const [catSnap, invSnap] = await Promise.all([
    get(categoriesRef),
    get(inventoryRef)
  ]);

  if (!catSnap.exists()) return { added: 0 };

  const categories = catSnap.val();
  const currentInv = invSnap.exists() ? invSnap.val() : {};
  const menuItems = extractMenuItems(categories);
  let addedCount = 0;

  const updates = {};
  const nextInventory = { ...currentInv };
  const now = new Date().toISOString();

  Object.entries(menuItems).forEach(([itemId, menuData]) => {
    if (!currentInv[itemId]) {
      // Create default inventory entry
      const defaultInventory = {
        productName: menuData.name || itemId,
        stock: 1,
        currentStock: 1,
        lastUpdated: now,
        lastModifiedBy: userId || 'system'
      };
      updates[itemId] = defaultInventory;
      nextInventory[itemId] = defaultInventory;
      addedCount++;
    } else if (currentInv[itemId].productName !== menuData.name) {
      // Update name if it changed in the menu
      updates[`${itemId}/productName`] = menuData.name;
      nextInventory[itemId] = {
        ...currentInv[itemId],
        productName: menuData.name,
      };
    }
  });

  if (Object.keys(updates).length > 0) {
    await update(inventoryRef, updates);
  }

  if (syncAvailability) {
    await syncMenuAvailabilityFromData(branchId, categories, nextInventory);
  }

  return { added: addedCount };
}

/**
 * Consume stock for a completed order.
 * Uses Firebase transactions to safely decrement stock.
 * Stock is clamped to 0 (never goes negative).
 *
 * @param {string} branchId
 * @param {string} orderId
 * @param {Array} orderItems - Array of { itemId, name, quantity }
 */
export async function consumeStockForOrder(branchId, orderId, orderItems) {
  if (!Array.isArray(orderItems) || orderItems.length === 0) return;

  await syncInventoryWithMenu(branchId, 'order-processor', { syncAvailability: false });

  const [inventorySnap, categoriesSnap] = await Promise.all([
    get(ref(database, `${branchId}/inventory`)),
    get(ref(database, `${branchId}/categories`)),
  ]);
  const inventoryData = inventorySnap.exists() ? inventorySnap.val() : {};
  const menuItems = categoriesSnap.exists() ? extractMenuItems(categoriesSnap.val()) : {};

  for (const item of orderItems) {
    const itemId = resolveInventoryItemId(item, inventoryData, menuItems);
    if (!itemId) continue;

    const qty = Number(item.quantity || 1);
    if (qty <= 0) continue;

    const stockRef = ref(database, `${branchId}/inventory/${itemId}`);
    let newStockAfterTransaction = 0;

    const result = await runTransaction(stockRef, (current) => {
      if (current === null) {
        // No inventory record exists yet — create one.
        // We can't deduct from stock that was never set, so start at 0 after consumption.
        // The item still gets tracked in inventory going forward.
        return {
          productName: item.name || menuItems[itemId]?.name || itemId,
          stock: 0,
          currentStock: 0,
          lastUpdated: new Date().toISOString(),
          lastModifiedBy: 'order-processor'
        };
      }

      const currentStock = readStock(current);
      const newStock = Math.max(0, currentStock - qty);

      return {
        ...current,
        stock: newStock,
        currentStock: newStock,
        lastUpdated: new Date().toISOString(),
        lastModifiedBy: 'order-processor'
      };
    });

    // Read the final stock from the committed transaction result
    if (result.committed && result.snapshot.exists()) {
      newStockAfterTransaction = readStock(result.snapshot.val());
    }

    // Always sync menu availability based on the final stock
    await syncMenuAvailability(branchId, itemId, newStockAfterTransaction);

    // Log consumption to history
    await addInventoryHistoryEntry(branchId, itemId, {
      type: 'order-consumption',
      quantity: qty,
      previousStock: null, // transaction-based, exact prev not known here
      newStock: newStockAfterTransaction,
      userId: 'order-processor',
      note: `Order #${orderId}`
    });
  }
}

/**
 * Mark an order as processed for inventory.
 * Uses Firebase SDK update() for consistent auth with the transaction writes.
 */
export async function markOrderInventoryProcessed(branchId, orderId) {
  try {
    const orderRef = ref(database, `${branchId}/logs/${orderId}`);
    await update(orderRef, {
      inventoryProcessed: true,
      inventoryProcessedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error marking order as inventory-processed:', error);
  }
}

// ─── Menu Availability Sync (PART 3) ────────────────────────────────────────

/**
 * Sync a menu item's availability based on stock level.
 *
 * - stock === 0 → set available = false in the menu
 * - stock > 0   → set available = true in the menu
 *
 * Searches all categories for the given itemId.
 * Uses the Firebase SDK so availability sync shares auth/listener behavior with inventory writes.
 */
export async function syncMenuAvailability(branchId, itemId, newStock) {
  try {
    const catRef = ref(database, `${branchId}/categories`);
    const catSnap = await get(catRef);
    if (!catSnap.exists()) return;

    const categories = catSnap.val();
    await syncMenuAvailabilityFromData(branchId, categories, {
      [itemId]: { stock: newStock, currentStock: newStock }
    }, new Set([itemId]));
  } catch (error) {
    console.error('Error syncing menu availability:', error);
  }
}

function isMenuAvailable(menuData) {
  return menuData?.available !== false && menuData?.available !== 'false';
}

/**
 * Batch-sync menu availability from already loaded category/inventory snapshots.
 * This avoids one Firebase read per item and only writes items whose availability
 * is out of sync with stock.
 */
export async function syncMenuAvailabilityFromData(branchId, categoriesData, inventoryData, itemIds = null) {
  if (!branchId || !categoriesData) return { updated: 0 };

  const updates = {};
  const allowedIds = itemIds ? new Set(Array.from(itemIds).map(String)) : null;

  Object.entries(categoriesData).forEach(([catName, catData]) => {
    if (!catData || typeof catData !== 'object') return;

    Object.entries(catData).forEach(([itemId, menuData]) => {
      if (itemId.startsWith('_') || !menuData || typeof menuData !== 'object') return;
      if (allowedIds && !allowedIds.has(itemId)) return;

      const inv = inventoryData?.[itemId];
      const stock = inv ? readStock(inv) : 1;
      const shouldBeAvailable = stock > 0;

      if (isMenuAvailable(menuData) !== shouldBeAvailable) {
        updates[`${catName}/${itemId}/available`] = shouldBeAvailable;
      }
    });
  });

  if (Object.keys(updates).length === 0) return { updated: 0 };

  await update(ref(database, `${branchId}/categories`), updates);
  return { updated: Object.keys(updates).length };
}
