# Analytics Integration Guide

## Overview

This guide explains how to integrate analytics with your order creation system, whether you're using:
- Tablet kiosk system
- Web-based ordering
- API-based orders
- Manual order entry

---

## Order Data Structure

Analytics expects orders in this structure:

```javascript
{
  branchId: {
    logs: {
      orderId_unique: {
        // REQUIRED FIELDS
        timestamp: "2026-06-10T10:30:00+08:00",  // ISO 8601 format
        total: 300,                               // Numeric (not string)
        items: [                                  // Array of items
          {
            itemId: "matcha_latte",              // Unique product ID
            name: "Matcha Latte",                 // Display name
            quantity: 2,                          // Numeric
            price: 150                            // Price per unit
          }
        ],
        
        // RECOMMENDED FIELDS
        customerName: "John Doe",                // For display
        paymentMethod: "cash",                   // For analysis
        status: "completed",                     // Order status
        
        // AUTO-ADDED BY ANALYTICS
        analyticsProcessed: true,                // Set after processing
        analyticsProcessedAt: "2026-06-10T10:30:05Z"  // Processing timestamp
      }
    }
  }
}
```

---

## Integration Scenarios

### Scenario 1: Kiosk/Tablet System Creating Orders

**Location**: Where orders are submitted to Firebase

**Action**: No changes needed! The analytics processor automatically picks up orders from the `logs` node.

**Process**:
1. Kiosk creates order in `{branchId}/logs/{orderId}`
2. `useAnalyticsProcessor` hook detects change via listener
3. Processor reads order data
4. Processor updates analytics nodes
5. Processor sets `analyticsProcessed: true`

**Code Example** (if you need to create orders in code):

```javascript
import { fetchWithAppCheck, dbUrl } from './lib/firebase';

export async function createOrder(branchId, orderData) {
  const timestamp = new Date().toISOString();
  
  const order = {
    customerName: orderData.customerName || 'Unnamed',
    timestamp: timestamp,
    items: orderData.items,  // Array of {itemId, name, quantity, price}
    total: orderData.total,   // Numeric
    paymentMethod: orderData.paymentMethod || 'cash',
    status: 'completed'
  };
  
  const orderId = `order_${Date.now()}`;
  
  await fetchWithAppCheck(dbUrl(`${branchId}/logs/${orderId}`), {
    method: 'PUT',
    body: JSON.stringify(order),
    headers: { 'Content-Type': 'application/json' },
  });
  
  // Analytics processor will automatically detect and process this order!
  return orderId;
}
```

---

### Scenario 2: API-Based Order Creation

**Location**: Your backend API that accepts orders

**Action**: Format orders to match the structure above before storing in Firebase

**Code Example** (Node.js):

```javascript
// Your backend receives an order
app.post('/api/orders', async (req, res) => {
  const { branchId, customerName, items, total, paymentMethod } = req.body;
  
  // Validate order data
  if (!total || !items || items.length === 0) {
    return res.status(400).json({ error: 'Invalid order data' });
  }
  
  // Format for Firebase analytics
  const order = {
    customerName: customerName || 'Unnamed',
    timestamp: new Date().toISOString(),
    items: items.map(item => ({
      itemId: item.id || item.itemId,
      name: item.name,
      quantity: parseInt(item.quantity) || 1,
      price: parseFloat(item.price) || 0
    })),
    total: parseFloat(total),
    paymentMethod: paymentMethod || 'cash',
    status: 'completed'
  };
  
  // Save to Firebase (using admin SDK)
  const orderId = `order_${Date.now()}`;
  const db = admin.database();
  
  await db.ref(`${branchId}/logs/${orderId}`).set(order);
  
  // Analytics processor will automatically process this order!
  res.json({ success: true, orderId });
});
```

---

### Scenario 3: Migrating Existing Orders

**Situation**: You have orders already in the system that haven't been processed

**Steps**:

1. **Check Current Structure**

```javascript
import { ref, get } from 'firebase/database';
import { database } from './lib/firebase';

const logsRef = ref(database, `${branchId}/logs`);
const snapshot = await get(logsRef);
console.log(snapshot.val()); // Check order structure
```

2. **Ensure Orders Have Required Fields**

If orders are missing fields, add them:

```javascript
import { fetchWithAppCheck, dbUrl } from './lib/firebase';

async function fixOrderStructure(branchId, orderId, order) {
  // Ensure required fields exist
  const fixed = {
    ...order,
    timestamp: order.timestamp || new Date().toISOString(),
    total: order.total || order.subtotal || 0,
    items: order.items || [],
    customerName: order.customerName || 'Unknown',
    paymentMethod: order.paymentMethod || 'cash',
    status: order.status || 'completed'
  };
  
  await fetchWithAppCheck(dbUrl(`${branchId}/logs/${orderId}`), {
    method: 'PUT',
    body: JSON.stringify(fixed),
    headers: { 'Content-Type': 'application/json' },
  });
}
```

3. **Reprocess All Orders**

```javascript
import { processOrderAnalytics } from './lib/analyticsApi';
import { ref, get } from 'firebase/database';
import { database } from './lib/firebase';

async function reprocessAllOrders(branchId) {
  const logsRef = ref(database, `${branchId}/logs`);
  const snapshot = await get(logsRef);
  const orders = snapshot.val();
  
  if (!orders) return;
  
  let count = 0;
  for (const [orderId, orderData] of Object.entries(orders)) {
    try {
      // Reset the analytics flag to force reprocessing
      await fetchWithAppCheck(dbUrl(`${branchId}/logs/${orderId}/analyticsProcessed`), {
        method: 'DELETE',
      });
      
      // Process the order
      await processOrderAnalytics(branchId, orderId, orderData);
      count++;
      
      // Add delay to avoid Firebase throttling
      await new Promise(r => setTimeout(r, 100));
    } catch (error) {
      console.error(`Failed to process ${orderId}:`, error);
    }
  }
  
  console.log(`Reprocessed ${count} orders`);
}

// Run migration
await reprocessAllOrders('branch1');
```

---

### Scenario 4: Real-time Kiosk Integration

**Location**: Kiosk system frontend code

**Action**: Ensure orders are saved to Firebase in the correct format

**Code Example** (React):

```javascript
import { fetchWithAppCheck, dbUrl } from './lib/firebase';
import { useState } from 'react';

export function OrderCheckout({ branchId, cartItems, customer }) {
  const [submitting, setSubmitting] = useState(false);
  
  async function submitOrder() {
    setSubmitting(true);
    
    try {
      // Calculate totals
      const total = cartItems.reduce((sum, item) => {
        const itemTotal = item.price * item.quantity;
        return sum + itemTotal;
      }, 0);
      
      // Format order for Firebase analytics
      const order = {
        customerName: customer.name || 'Walk-in Customer',
        timestamp: new Date().toISOString(),
        items: cartItems.map(item => ({
          itemId: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price
        })),
        total: total,
        paymentMethod: 'cash',  // or 'card', 'qr_code', etc.
        status: 'completed'
      };
      
      // Create unique order ID
      const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Save to Firebase
      const response = await fetchWithAppCheck(dbUrl(`${branchId}/logs/${orderId}`), {
        method: 'PUT',
        body: JSON.stringify(order),
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        console.log('Order saved! Analytics will process automatically.');
        // Show success message
      } else {
        throw new Error('Failed to save order');
      }
    } catch (error) {
      console.error('Order submission failed:', error);
      // Show error message
    } finally {
      setSubmitting(false);
    }
  }
  
  return (
    <button onClick={submitOrder} disabled={submitting}>
      {submitting ? 'Processing...' : 'Submit Order'}
    </button>
  );
}
```

---

## Required Fields Explained

### timestamp (Required)
- **Format**: ISO 8601 string (e.g., "2026-06-10T10:30:00+08:00")
- **Why**: Used to group orders into hourly/daily/weekly/monthly buckets
- **Example**: `new Date().toISOString()`

### total (Required)
- **Type**: Number (not string)
- **Why**: Used for revenue calculations and aggregations
- **Example**: `300` (not `"300"`)

### items (Required)
- **Type**: Array of items
- **Each item needs**: `itemId`, `name`, `quantity`, `price`
- **Why**: Used for product analytics calculations

### items[].itemId (Required)
- **Type**: String
- **Why**: Unique identifier for product tracking
- **Must be**: Consistent across orders (same product = same ID)

### items[].quantity (Required)
- **Type**: Number (not string)
- **Why**: Used for quantity calculations
- **Example**: `2` (not `"2"`)

### items[].price (Required)
- **Type**: Number (not string)
- **Why**: Used for revenue calculations
- **Example**: `150` (not `"150"`)

---

## Common Data Format Issues

### ❌ Wrong: String Numbers
```javascript
// WRONG - These are strings!
{
  total: "300",              // Should be number
  items: [{
    quantity: "2",           // Should be number
    price: "150"             // Should be number
  }]
}
```

### ✅ Correct: Actual Numbers
```javascript
{
  total: 300,
  items: [{
    quantity: 2,
    price: 150
  }]
}
```

### ❌ Wrong: Missing Items
```javascript
// WRONG - No items array
{
  total: 300,
  items: null
}
```

### ✅ Correct: Items Array
```javascript
{
  total: 300,
  items: [
    { itemId: "item1", name: "Product", quantity: 1, price: 300 }
  ]
}
```

### ❌ Wrong: Inconsistent Product IDs
```javascript
// WRONG - Same product, different IDs
// Order 1:
{ itemId: "coffee", name: "Coffee" }
// Order 2:
{ itemId: "coffee_hot", name: "Coffee" }
// These will be counted as different products!
```

### ✅ Correct: Consistent Product IDs
```javascript
// CORRECT - Always use same ID for same product
// Order 1:
{ itemId: "coffee_espresso", name: "Espresso Coffee" }
// Order 2:
{ itemId: "coffee_espresso", name: "Espresso Coffee" }
```

---

## Debugging Order Processing

### Check If Order Was Processed

```javascript
import { ref, get } from 'firebase/database';
import { database } from './lib/firebase';

async function checkOrderStatus(branchId, orderId) {
  const orderRef = ref(database, `${branchId}/logs/${orderId}`);
  const snapshot = await get(orderRef);
  
  if (!snapshot.exists()) {
    console.log('Order not found');
    return;
  }
  
  const order = snapshot.val();
  console.log('Order:', order);
  console.log('Processed:', order.analyticsProcessed === true);
  console.log('Processed At:', order.analyticsProcessedAt);
}

// Usage
await checkOrderStatus('branch1', 'order_1686403800000_abc123');
```

### View Analytics for a Specific Day

```javascript
import { ref, get } from 'firebase/database';
import { database } from './lib/firebase';

async function viewDayAnalytics(branchId, dateString) {
  // dateString format: "2026-06-10"
  
  const dailyRef = ref(database, `${branchId}/analytics/daily/${dateString}`);
  const snapshot = await get(dailyRef);
  
  if (!snapshot.exists()) {
    console.log('No analytics for this date yet');
    return;
  }
  
  const analytics = snapshot.val();
  console.log(`Analytics for ${dateString}:`, {
    orders: analytics.orders,
    revenue: analytics.revenue,
    averageOrderValue: analytics.averageOrderValue
  });
}

// Usage
await viewDayAnalytics('branch1', '2026-06-10');
```

### Check Product Analytics

```javascript
import { getProductsAnalytics } from './lib/analyticsApi';

const products = await getProductsAnalytics('branch1');

console.log('Product Rankings:');
Object.entries(products)
  .sort(([, a], [, b]) => (b.quantitySold || 0) - (a.quantitySold || 0))
  .forEach(([id, data], index) => {
    console.log(`${index + 1}. ${data.name}: ${data.quantitySold} sold, ₱${data.revenue} revenue`);
  });
```

---

## Validation Checklist

Before submitting an order to Firebase, verify:

- [ ] `timestamp` is ISO 8601 format string
- [ ] `total` is a number > 0
- [ ] `items` is a non-empty array
- [ ] Each item has: `itemId`, `name`, `quantity`, `price`
- [ ] `quantity` is a positive number
- [ ] `price` is a positive number
- [ ] `itemId` is consistent across orders for same product
- [ ] `customerName` is a string (can be empty)
- [ ] `paymentMethod` is a string
- [ ] No `analyticsProcessed` flag (will be added automatically)

---

## Testing Your Integration

### Test 1: Create Single Test Order

```javascript
import { fetchWithAppCheck, dbUrl } from './lib/firebase';

async function testOrder() {
  const testOrder = {
    customerName: 'Test Customer',
    timestamp: new Date().toISOString(),
    items: [
      {
        itemId: 'test_coffee',
        name: 'Test Coffee',
        quantity: 1,
        price: 100
      }
    ],
    total: 100,
    paymentMethod: 'cash',
    status: 'completed'
  };
  
  await fetchWithAppCheck(dbUrl('branch1/logs/test_order_1'), {
    method: 'PUT',
    body: JSON.stringify(testOrder),
    headers: { 'Content-Type': 'application/json' },
  });
}

await testOrder();
// Wait 5 seconds, then check analytics
```

### Test 2: Verify Analytics Updated

```javascript
// After 5-10 seconds, run:
await viewDayAnalytics('branch1', new Date().toISOString().split('T')[0]);
// Should show: orders: 1, revenue: 100
```

### Test 3: Bulk Test Orders

```javascript
async function createBulkTestOrders(branchId, count = 5) {
  const products = [
    { id: 'coffee', name: 'Coffee', price: 100 },
    { id: 'tea', name: 'Tea', price: 80 },
    { id: 'juice', name: 'Juice', price: 90 }
  ];
  
  for (let i = 0; i < count; i++) {
    const product = products[i % products.length];
    const order = {
      customerName: `Customer ${i + 1}`,
      timestamp: new Date(Date.now() - i * 3600000).toISOString(), // Spread over hours
      items: [
        {
          itemId: product.id,
          name: product.name,
          quantity: Math.floor(Math.random() * 3) + 1,
          price: product.price
        }
      ],
      total: product.price * (Math.floor(Math.random() * 3) + 1),
      paymentMethod: Math.random() > 0.5 ? 'cash' : 'card',
      status: 'completed'
    };
    
    await fetchWithAppCheck(dbUrl(`${branchId}/logs/test_order_${i}`), {
      method: 'PUT',
      body: JSON.stringify(order),
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

await createBulkTestOrders('branch1', 10);
```

---

## Firebase Security Rules

Ensure your Firebase Realtime Database security rules allow analytics access:

```json
{
  "rules": {
    "{branchId}": {
      "logs": {
        ".read": true,
        ".write": "auth != null"
      },
      "analytics": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

---

## Summary

To integrate analytics with your ordering system:

1. **Save orders** to `{branchId}/logs/{orderId}` with the required structure
2. **Use correct data types** (numbers for amounts/quantities, ISO strings for timestamps)
3. **Maintain consistent product IDs** across orders
4. **Enable the analytics processor** in BranchHomePage (already done)
5. **View analytics** in the dashboard after orders are created

The rest happens automatically! ✅

---

For questions or issues, refer to:
- `ANALYTICS_DOCUMENTATION.md` - Complete reference
- `ANALYTICS_QUICKSTART.md` - Quick start guide
- `src/lib/analyticsApi.js` - Function documentation
