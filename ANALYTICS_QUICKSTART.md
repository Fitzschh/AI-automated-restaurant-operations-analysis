# Analytics Implementation Quick Start

## What Was Added

This implementation adds a complete Firebase Realtime Database analytics layer to your ordering system. Here's what was created:

### New Files

#### 1. **`src/lib/analyticsApi.js`** - Core Analytics Functions
   - Initialize analytics structure
   - Process orders and update analytics
   - Fetch analytics data
   - Real-time listeners for dashboard
   - Date/time key formatting helpers

#### 2. **`src/lib/statisticsUtils.js`** - Statistical Calculations
   - Mean, median, mode calculations
   - Standard deviation, percentile
   - Sum, min, max utilities
   - Currency and number formatting
   - Safe handling of edge cases

#### 3. **`src/hooks/useAnalyticsProcessor.js`** - Real-time Processor Hook
   - Monitors orders in real-time
   - Automatically triggers analytics updates
   - Prevents duplicate processing
   - Initializes analytics structure

#### 4. **`src/pages/AnalyticsDashboard.jsx`** - Analytics Dashboard Page
   - Summary metrics display
   - Period filtering (today, week, month, all-time)
   - Product rankings table
   - Daily trends table
   - Statistical summaries
   - Real-time updates

#### 5. **`src/components/analytics/AnalyticsCard.jsx`** - Reusable Card Component
   - Displays individual metrics
   - Supports trends and icons
   - Responsive design

#### 6. **`src/components/analytics/AnalyticsDashboard.module.css`** - Analytics Styling
   - Dashboard layout and styling
   - Card designs with hover effects
   - Responsive mobile design
   - Animation effects

### Updated Files

#### 1. **`src/App.jsx`**
   - Added import for `useAnalyticsProcessor` hook
   - Added import for `AnalyticsDashboard` page
   - Added route: `/analytics/:branchId`

#### 2. **`src/pages/BranchHomePage.jsx`**
   - Added import for `useAnalyticsProcessor` hook
   - Enabled analytics processor with hook
   - Added "📊 Analytics" button next to "Configure Menu"
   - Button navigates to analytics dashboard

## How to Use

### Step 1: Start Using It Automatically

The analytics system starts working immediately! The `useAnalyticsProcessor` hook is already enabled in BranchHomePage:

1. Navigate to a branch home page
2. Create orders in the system (via the kiosk or API)
3. The analytics processor monitors all orders
4. Analytics are updated in real-time in Firebase

### Step 2: View the Analytics Dashboard

1. Click the **📊 Analytics** button on any branch home page
2. View summary metrics and product rankings
3. Use time period selector to view different time ranges
4. All data updates in real-time

### Step 3: Customize (Optional)

#### Change Currency Symbol

In `src/lib/statisticsUtils.js`, update the `formatCurrency` function:

```javascript
export function formatCurrency(value, currency = '₱') {
  // Change '₱' to your currency symbol
}
```

#### Add New Metrics

To add a new metric to track:

1. Update the transaction in `analyticsApi.js` `processOrderAnalytics()` function
2. Add a fetcher function `getYourMetric(branchId)`
3. Add a real-time listener `onYourMetricChange(branchId, callback)` if needed
4. Update `AnalyticsDashboard.jsx` to display it

#### Change Dashboard Colors

Edit `src/components/analytics/AnalyticsDashboard.module.css`:

- Primary color: `#16a085` (teal)
- Background: `#1a1a2e` (dark blue)
- Accent: `#0f3460` (darker blue)

## Database Structure

Orders must follow this structure to be processed:

```javascript
{
  branchId: {
    logs: {
      orderId: {
        customerName: "John Doe",
        timestamp: "2026-06-10T10:30:00+08:00",
        items: [
          {
            itemId: "matcha_latte",
            name: "Matcha Latte",
            quantity: 2,
            price: 150
          }
        ],
        total: 300,
        paymentMethod: "cash",
        status: "completed"
        // analyticsProcessed flag is added automatically after processing
      }
    }
  }
}
```

Analytics are stored separately:

```javascript
{
  branchId: {
    analytics: {
      summary: { /* totals and averages */ },
      products: { /* per-product analytics */ },
      hourly: { /* hourly data */ },
      daily: { /* daily data */ },
      weekly: { /* weekly data */ },
      monthly: { /* monthly data */ },
      statistics: { /* calculated statistics */ }
    }
  }
}
```

## Key Features Explained

### 1. Real-time Processing

Orders are processed instantly as they're added:

```
Order Created → useAnalyticsProcessor Detects → Processes Atomically → Analytics Updated
```

### 2. Duplicate Prevention

Each order is only processed once:

```
Order arrives → Check analyticsProcessed flag
  ├─ If false/missing → Process and set to true
  └─ If true → Skip (already processed)
```

### 3. Transaction Safety

Multiple concurrent orders are handled safely:

```
runTransaction() {
  Read current analytics
  Update with new order data
  Write atomically back to DB
}
```

## Common Tasks

### Manually Process an Order

```javascript
import { processOrderAnalytics } from './lib/analyticsApi';

const orderId = 'order123';
const orderData = {
  customerName: 'John Doe',
  timestamp: '2026-06-10T10:30:00+08:00',
  items: [/* ... */],
  total: 300,
  paymentMethod: 'cash'
};

await processOrderAnalytics(branchId, orderId, orderData);
```

### Reprocess All Orders (e.g., after migration)

```javascript
import { processOrderAnalytics } from './lib/analyticsApi';
import { ref, get } from 'firebase/database';
import { database } from './lib/firebase';

const logsRef = ref(database, `${branchId}/logs`);
const snapshot = await get(logsRef);

for (const [orderId, orderData] of Object.entries(snapshot.val())) {
  await processOrderAnalytics(branchId, orderId, orderData);
}
```

### Export Analytics Data

```javascript
import { 
  getAnalyticsSummary, 
  getDailyAnalytics,
  getProductsAnalytics 
} from './lib/analyticsApi';

const summary = await getAnalyticsSummary(branchId);
const daily = await getDailyAnalytics(branchId);
const products = await getProductsAnalytics(branchId);

// Convert to CSV or JSON for export
console.log(JSON.stringify({ summary, daily, products }, null, 2));
```

## Testing

### Test the Analytics Processor

1. Create a sample order in Firebase:

```
{branchId}/logs/test_order_1
{
  "customerName": "Test User",
  "timestamp": "2026-06-10T10:30:00+08:00",
  "items": [
    {
      "itemId": "test_item",
      "name": "Test Product",
      "quantity": 2,
      "price": 100
    }
  ],
  "total": 200,
  "paymentMethod": "cash"
}
```

2. Wait ~5 seconds
3. Check Firebase and you should see:
   - `analytics/summary/totalOrders: 1`
   - `analytics/products/test_item/quantitySold: 2`
   - `analytics/daily/2026-06-10/orders: 1`
   - `logs/test_order_1/analyticsProcessed: true`

### Test the Dashboard

1. Create 5-10 test orders with different products
2. Open the analytics dashboard
3. Verify metrics match your test data
4. Try the time period selector
5. Verify tables show correct data

## Troubleshooting

### Analytics Not Updating

**Problem**: Orders are added but analytics don't update

**Solutions**:
1. Verify `useAnalyticsProcessor` hook is running in BranchHomePage
2. Check browser console for errors
3. Verify order has required fields: `timestamp`, `total`, `items`
4. Ensure Firebase security rules allow reads/writes to analytics path

### Dashboard Shows No Data

**Problem**: Analytics dashboard is blank

**Solutions**:
1. Create at least one order first
2. Wait 5-10 seconds for processing
3. Refresh the page
4. Check Firebase console to verify data exists
5. Check browser DevTools for network errors

### Performance Issues

**Problem**: Dashboard is slow to load

**Solutions**:
1. Close real-time listeners when not viewing dashboard
2. Consider archiving very old data (>1 year)
3. Reduce number of products displayed in table
4. Optimize Firebase indexes

## Next Steps

1. **Deploy**: Push changes to your Firebase project
2. **Test**: Create sample orders and verify analytics
3. **Monitor**: Watch the analytics dashboard during first week
4. **Optimize**: Adjust colors, layout, and metrics based on needs
5. **Extend**: Add custom metrics or export functionality

## Support

For detailed information:
- See `ANALYTICS_DOCUMENTATION.md` for complete API reference
- Check `src/lib/analyticsApi.js` for function documentation
- Review `src/components/analytics/AnalyticsDashboard.jsx` for dashboard customization
- Check Firebase console for data structure verification

---

**Ready to go!** Your analytics system is now live and processing orders automatically. 🎉
