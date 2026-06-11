import { ref, set, get, remove } from 'firebase/database';
import { database } from './firebase';
import { processOrderAnalytics } from './analyticsApi';

// Sample cafe products
const PRODUCTS = [
  { id: 'matcha_latte', name: 'Matcha Latte', price: 180, category: 'Drinks' },
  { id: 'spanish_latte', name: 'Spanish Latte', price: 160, category: 'Drinks' },
  { id: 'americano', name: 'Iced Americano', price: 120, category: 'Drinks' },
  { id: 'cappuccino', name: 'Cappuccino', price: 140, category: 'Drinks' },
  { id: 'caramel_macchiato', name: 'Caramel Macchiato', price: 170, category: 'Drinks' },
  { id: 'croissant', name: 'Butter Croissant', price: 80, category: 'Pastries' },
  { id: 'cheesecake', name: 'New York Cheesecake', price: 150, category: 'Pastries' },
  { id: 'chocolate_cake', name: 'Chocolate Cake', price: 160, category: 'Pastries' }
];

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomOrder(branchId, timestamp, orderNum) {
  // 1 to 4 items per order
  const numItems = getRandomInt(1, 4);
  const items = {};
  let totalAmount = 0;

  for (let i = 0; i < numItems; i++) {
    const product = PRODUCTS[getRandomInt(0, PRODUCTS.length - 1)];
    const quantity = getRandomInt(1, 2);
    
    // Check if we already added this product, if so just add quantity
    if (items[product.id]) {
      items[product.id].quantity += quantity;
      items[product.id].totalPrice += (product.price * quantity);
    } else {
      items[product.id] = {
        name: product.name,
        price: product.price,
        quantity: quantity,
        totalPrice: product.price * quantity
      };
    }
    totalAmount += (product.price * quantity);
  }

  return {
    orderNum: `TEST-${orderNum.toString().padStart(4, '0')}`,
    timestamp,
    status: 'completed',
    items,
    total: totalAmount,
    paymentMethod: Math.random() > 0.3 ? 'online' : 'counter',
    customerName: `Test Customer ${orderNum}`,
    isTestData: true
  };
}

export async function seedTestOrders(branchId) {
  console.log(`Starting to seed test data for ${branchId}...`);
  
  // Clean existing test data first
  await cleanupTestData(branchId);

  const now = new Date();
  const ordersToCreate = 60;
  const promises = [];
  
  // Create orders spread over the last 30 days
  for (let i = 1; i <= ordersToCreate; i++) {
    // Random day in the last 30 days
    const daysAgo = getRandomInt(0, 30);
    // Random hour between 8 AM and 9 PM (8 to 21)
    const hour = getRandomInt(8, 21);
    // Random minute
    const minute = getRandomInt(0, 59);
    
    const orderDate = new Date(now);
    orderDate.setDate(now.getDate() - daysAgo);
    orderDate.setHours(hour, minute, 0, 0);
    
    const order = generateRandomOrder(branchId, orderDate.getTime(), i);
    
    // Process analytics for this order (3 args: branchId, orderId, orderData)
    promises.push(processOrderAnalytics(branchId, order.orderNum, order));
  }

  // Also simulate adding these items to the menu categories if they don't exist
  // This helps the dashboard format names correctly
  const categoriesRef = ref(database, `${branchId}/categories`);
  const categoriesSnapshot = await get(categoriesRef);
  
  if (!categoriesSnapshot.exists()) {
    console.log("Creating default categories for test data...");
    const drinksItems = {};
    const pastriesItems = {};
    
    PRODUCTS.forEach(p => {
      const itemNode = {
        name: p.name,
        price: p.price,
        available: true,
        description: 'Test product',
        options: []
      };
      if (p.category === 'Drinks') drinksItems[p.id] = itemNode;
      else pastriesItems[p.id] = itemNode;
    });

    await set(ref(database, `${branchId}/categories/Drinks`), {
      name: 'Drinks',
      available: true,
      items: drinksItems
    });
    
    await set(ref(database, `${branchId}/categories/Pastries`), {
      name: 'Pastries',
      available: true,
      items: pastriesItems
    });
  }

  await Promise.all(promises);
  console.log(`Successfully seeded ${ordersToCreate} test orders and updated analytics.`);
  return true;
}

export async function cleanupTestData(branchId) {
  console.log(`Cleaning up test data for ${branchId}...`);
  
  // Delete all analytics
  const analyticsRef = ref(database, `${branchId}/analytics`);
  await remove(analyticsRef);
  
  console.log('Analytics data cleared.');
  return true;
}
