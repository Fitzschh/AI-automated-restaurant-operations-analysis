import { ref, get, set, update, push, onValue, off } from 'firebase/database';
import { database } from './firebase';

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
  onValue(inventoryRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : {});
  });
  return () => off(inventoryRef);
}

/**
 * Update thresholds or unit for an item
 */
export async function updateInventoryItem(branchId, itemId, data) {
  const itemRef = ref(database, `${branchId}/inventory/${itemId}`);
  await update(itemRef, {
    ...data,
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
 * Also logs the adjustment to history
 */
export async function adjustStock(branchId, itemId, adjustment, previousStock, newStock, userId, note = '') {
  // Update current stock
  const itemRef = ref(database, `${branchId}/inventory/${itemId}`);
  await update(itemRef, {
    currentStock: newStock,
    lastUpdated: new Date().toISOString(),
    lastModifiedBy: userId || 'unknown'
  });

  // Determine adjustment type
  let type = 'adjustment';
  if (adjustment > 0) type = 'increase';
  if (adjustment < 0) type = 'decrease';

  // Log to history
  await addInventoryHistoryEntry(branchId, itemId, {
    type,
    quantity: Math.abs(adjustment),
    previousStock,
    newStock,
    userId: userId || 'unknown',
    note
  });

  return true;
}

/**
 * Sync inventory with menu categories
 * Creates default inventory entries for any menu items that don't exist in inventory yet.
 */
export async function syncInventoryWithMenu(branchId, userId) {
  const categoriesRef = ref(database, `${branchId}/categories`);
  const inventoryRef = ref(database, `${branchId}/inventory`);
  
  const [catSnap, invSnap] = await Promise.all([
    get(categoriesRef),
    get(inventoryRef)
  ]);

  if (!catSnap.exists()) return { added: 0 };

  const categories = catSnap.val();
  const currentInv = invSnap.exists() ? invSnap.val() : {};
  let addedCount = 0;

  // Gather all items from all categories
  const allMenuItems = {};
  Object.values(categories).forEach(cat => {
    if (cat.items) {
      Object.entries(cat.items).forEach(([itemId, itemData]) => {
        allMenuItems[itemId] = itemData;
      });
    }
  });

  // Check which items are missing from inventory
  const updates = {};
  const historyPromises = [];
  
  Object.entries(allMenuItems).forEach(([itemId, itemData]) => {
    if (!currentInv[itemId]) {
      // Create default inventory entry
      updates[itemId] = {
        productName: itemData.name || itemId,
        currentStock: 0,
        warningLevel: 10,
        criticalLevel: 5,
        unit: 'units',
        lastUpdated: new Date().toISOString(),
        lastModifiedBy: userId || 'system'
      };
      
      // Queue history log
      historyPromises.push(
        addInventoryHistoryEntry(branchId, itemId, {
          type: 'sync',
          quantity: 0,
          previousStock: 0,
          newStock: 0,
          userId: userId || 'system',
          note: 'Initial sync from menu'
        })
      );
      
      addedCount++;
    } else if (currentInv[itemId].productName !== itemData.name) {
      // Update name if it changed in the menu
      updates[`${itemId}/productName`] = itemData.name;
    }
  });

  if (Object.keys(updates).length > 0) {
    await update(inventoryRef, updates);
    await Promise.all(historyPromises);
  }

  return { added: addedCount };
}

/**
 * Fetch history for a specific item
 */
export async function getInventoryHistory(branchId, itemId) {
  const historyRef = ref(database, `${branchId}/inventoryHistory/${itemId}`);
  const snapshot = await get(historyRef);
  return snapshot.exists() ? snapshot.val() : {};
}
