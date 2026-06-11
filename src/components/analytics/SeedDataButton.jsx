/**
 * TEST-ONLY: SeedDataButton
 * 
 * Developer tool for generating random test orders.
 * Visible to managers/owners only (not customers).
 * Generates completed orders using existing menu items.
 */
import { useState } from 'react';
import { ref, get } from 'firebase/database';
import { database } from '../../lib/firebase';
import { processOrderAnalytics } from '../../lib/analyticsApi';
import { SyncIcon, TrashIcon } from './AnalyticsIcons';

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Fetch actual menu items from this branch's categories in Firebase.
 * Falls back to a hardcoded list if no categories exist.
 */
async function getMenuProducts(branchId) {
  const categoriesRef = ref(database, `${branchId}/categories`);
  const snap = await get(categoriesRef);
  
  if (snap.exists()) {
    const categories = snap.val();
    const products = [];
    Object.entries(categories).forEach(([catName, catData]) => {
      if (catData.items && typeof catData.items === 'object') {
        Object.entries(catData.items).forEach(([itemId, item]) => {
          products.push({
            id: itemId,
            name: item.name || itemId,
            price: Number(item.price) || 100,
            category: catName,
          });
        });
      }
    });
    if (products.length > 0) return products;
  }
  
  // Fallback products if no menu exists
  return [
    { id: 'matcha_latte', name: 'Matcha Latte', price: 180, category: 'Drinks' },
    { id: 'spanish_latte', name: 'Spanish Latte', price: 160, category: 'Drinks' },
    { id: 'americano', name: 'Iced Americano', price: 120, category: 'Drinks' },
    { id: 'cappuccino', name: 'Cappuccino', price: 140, category: 'Drinks' },
    { id: 'croissant', name: 'Butter Croissant', price: 80, category: 'Pastries' },
  ];
}

function generateRandomOrder(products, timestamp, orderNum) {
  const numItems = getRandomInt(1, 4);
  const items = {};
  let total = 0;

  for (let i = 0; i < numItems; i++) {
    const product = products[getRandomInt(0, products.length - 1)];
    const quantity = getRandomInt(1, 3);
    const subtotal = product.price * quantity;
    
    if (items[product.id]) {
      items[product.id].quantity += quantity;
      items[product.id].subtotal += subtotal;
    } else {
      items[product.id] = {
        name: product.name,
        price: product.price,
        quantity: quantity,
        subtotal: subtotal,
      };
    }
    total += subtotal;
  }

  return {
    orderNum: `TEST-${orderNum.toString().padStart(4, '0')}`,
    timestamp,
    status: 'completed',
    items,
    total,
    paymentMethod: Math.random() > 0.3 ? 'online' : 'counter',
    customerName: `Test Customer ${orderNum}`,
    isTestData: true,
  };
}

export default function SeedDataButton({ branchId, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(null); // which count is running

  const handleGenerate = async (numOrders) => {
    if (!confirm(`Generate ${numOrders} random test orders? This will populate analytics data.`)) return;
    
    setLoading(true);
    setCount(numOrders);
    try {
      const products = await getMenuProducts(branchId);
      const now = new Date();
      const promises = [];

      for (let i = 1; i <= numOrders; i++) {
        const daysAgo = getRandomInt(0, 30);
        const hour = getRandomInt(8, 21);
        const minute = getRandomInt(0, 59);
        
        const orderDate = new Date(now);
        orderDate.setDate(now.getDate() - daysAgo);
        orderDate.setHours(hour, minute, 0, 0);
        
        const order = generateRandomOrder(products, orderDate.getTime(), i);
        promises.push(processOrderAnalytics(branchId, order.orderNum, order));
      }

      await Promise.all(promises);
      console.log(`[TEST] Successfully generated ${numOrders} test orders`);
      if (onComplete) onComplete();
    } catch (err) {
      console.error("Failed to generate test orders", err);
      alert("Error generating orders. Check console.");
    } finally {
      setLoading(false);
      setCount(null);
    }
  };

  const btnBase = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    borderRadius: 'var(--radius-sm)',
    cursor: loading ? 'not-allowed' : 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
    opacity: loading ? 0.7 : 1,
  };

  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', alignSelf: 'center', marginRight: '4px' }}>
        Generate Test Orders:
      </span>
      {[10, 50, 100].map(n => (
        <button
          key={n}
          onClick={() => handleGenerate(n)}
          disabled={loading}
          style={btnBase}
          title={`Generate ${n} random completed orders for testing`}
        >
          <SyncIcon size={12} style={{ animation: loading && count === n ? 'spin 1s linear infinite' : 'none' }} />
          {loading && count === n ? `${n}...` : `${n}`}
        </button>
      ))}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
