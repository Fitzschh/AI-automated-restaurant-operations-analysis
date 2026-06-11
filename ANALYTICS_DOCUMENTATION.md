# Firebase Realtime Database Analytics System

## Overview

This analytics system automatically tracks and aggregates order data from your self-ordering kiosk system. The analytics are stored separately from customer-facing data and only accessible to owners/managers via the Analytics Dashboard.

## Features

### Automatic Analytics Processing
- **Real-time Updates**: Analytics update automatically as orders are completed
- **Duplicate Prevention**: Each order is only processed once using the `analyticsProcessed` flag
- **Transaction Safety**: Uses Firebase transactions to ensure data consistency when multiple orders are processed simultaneously

### Tracked Metrics

#### Summary Metrics
- **Total Orders**: All-time total number of completed orders
- **Total Revenue**: All-time total revenue
- **Average Order Value**: Mean revenue per order
- **Best Selling Item**: Product with highest quantity sold
- **Least Selling Item**: Product with lowest quantity sold

#### Time-Based Analytics
- **Hourly**: Orders and revenue tracked by hour within each day
- **Daily**: Orders, revenue, and average order value per day
- **Weekly**: Orders and revenue per ISO week
- **Monthly**: Orders and revenue per month

#### Product Analytics
For each product:
- **Quantity Sold**: Total units sold
- **Revenue**: Total revenue from this product
- **Order Count**: Number of orders containing this product
- **Average Price**: Calculated as revenue / order count

#### Statistical Calculations
- **Mean Daily Orders**: Average orders per day
- **Median Daily Orders**: Middle value of daily orders
- **Mode Daily Orders**: Most common daily order count
- **Mean Daily Revenue**: Average revenue per day
- **Median Daily Revenue**: Middle value of daily revenue

## Database Structure

Analytics are stored in separate nodes to keep them isolated from customer-facing data:

```
{branchId}/
  analytics/
    summary/                    # Overall business metrics
      totalOrders: 0
      totalRevenue: 0
      averageOrderValue: 0
      bestSellingItem: ""
      leastSellingItem: ""
      lastUpdated: "ISO-8601"
    
    products/                   # Per-product analytics
      {productId}/
        name: "Product Name"
        quantitySold: 0
        revenue: 0
        orderCount: 0
    
    hourly/                     # Hourly data by date
      "2026-06-10"/
        "10"/
          orders: 0
          revenue: 0
    
    daily/                      # Daily aggregates
      "2026-06-10"/
        orders: 0
        revenue: 0
        averageOrderValue: 0
    
    weekly/                     # Weekly aggregates
      "2026-W24"/
        orders: 0
        revenue: 0
    
    monthly/                    # Monthly aggregates
      "2026-06"/
        orders: 0
        revenue: 0
    
    statistics/                 # Calculated statistics
      ordersPerDay/
        mean: 0
        median: 0
        mode: 0
      revenuePerDay/
        mean: 0
        median: 0
```

## How It Works

### 1. Order Processing Flow

When an order is created in `{branchId}/logs/`:

```
{branchId}/logs/{orderId}/
  customerName: "John Doe"
  timestamp: "2026-06-10T10:30:00+08:00"
  items: [
    {
      itemId: "matcha_latte",
      name: "Matcha Latte",
      quantity: 2,
      price: 150
    }
  ]
  total: 300
  paymentMethod: "cash"
  status: "completed"
```

### 2. Real-time Listener Activation

The `useAnalyticsProcessor` hook monitors all orders in real-time:

```javascript
// In BranchHomePage.jsx
useAnalyticsProcessor(branchId, true);
```

### 3. Analytics Update Process

When a new order is detected:

1. **Check Duplication**: Verify `analyticsProcessed` flag is not already set
2. **Extract Data**: Parse order timestamp, items, and total
3. **Use Transaction**: Update analytics atomically in Firebase
4. **Update Summary**: Increment totals, recalculate averages
5. **Update Products**: Increment product quantities and revenues
6. **Update Time Buckets**: Add to hourly, daily, weekly, monthly aggregates
7. **Recalculate Statistics**: Update mean, median, mode values
8. **Mark Processed**: Set `analyticsProcessed: true` and `analyticsProcessedAt` timestamp

### 4. Data Access Control

The system includes built-in access control:

```javascript
// In AnalyticsDashboard.jsx
<ProtectedRoute>
  <AnalyticsDashboard />
</ProtectedRoute>
```

Only authenticated users can access the analytics dashboard. Extend the protection rules in `src/config/authConfig.js` to limit access further if needed.

## API Reference

### Core Analytics Functions

#### Initialize Analytics
```javascript
import { initializeAnalytics } from './lib/analyticsApi';

await initializeAnalytics(branchId);
```

Creates the analytics structure if it doesn't exist. Called automatically by the processor.

#### Process Order
```javascript
import { processOrderAnalytics } from './lib/analyticsApi';

await processOrderAnalytics(branchId, orderId, orderData);
```

Manually trigger analytics processing for an order. Usually called automatically by the listener.

#### Fetch Analytics Data
```javascript
import { 
  getAnalyticsSummary,
  getProductsAnalytics,
  getDailyAnalytics,
  getHourlyAnalytics,
  getWeeklyAnalytics,
  getMonthlyAnalytics,
  getStatistics,
  getTodayAnalytics,
  getCurrentWeekAnalytics,
  getCurrentMonthAnalytics
} from './lib/analyticsApi';

const summary = await getAnalyticsSummary(branchId);
const products = await getProductsAnalytics(branchId);
const daily = await getDailyAnalytics(branchId);
```

### Real-time Listeners

Subscribe to real-time changes:

```javascript
import { 
  onAnalyticsSummaryChange,
  onProductsAnalyticsChange,
  onDailyAnalyticsChange
} from './lib/analyticsApi';

const unsubscribe = onAnalyticsSummaryChange(branchId, (summary) => {
  console.log('Summary updated:', summary);
});

// Clean up when done
unsubscribe();
```

### Statistical Utilities

```javascript
import {
  calculateMean,
  calculateMedian,
  calculateMode,
  calculateStandardDeviation,
  calculatePercentile,
  formatCurrency,
  formatNumber
} from './lib/statisticsUtils';

const mean = calculateMean([10, 20, 30]);
const median = calculateMedian([10, 20, 30]);
const formatted = formatCurrency(1500); // "₱1500.00"
```

## Date/Time Formatting

The system uses specific formats for time-based keys:

- **Daily**: `YYYY-MM-DD` (e.g., "2026-06-10")
- **Hourly**: `HH` (0-23, e.g., "10")
- **Weekly**: `YYYY-Www` ISO format (e.g., "2026-W24")
- **Monthly**: `YYYY-MM` (e.g., "2026-06")

These formats are automatically generated by helper functions:

```javascript
import {
  formatDateKey,
  formatMonthKey,
  formatWeekKey,
  formatHourKey
} from './lib/analyticsApi';

formatDateKey(new Date()); // "2026-06-10"
formatMonthKey(new Date()); // "2026-06"
formatWeekKey(new Date()); // "2026-W24"
formatHourKey(new Date()); // "10"
```

## Accessing the Analytics Dashboard

### For Owners/Managers

1. Log in to the system
2. Click the **📊 Analytics** button on the branch home page
3. View summary metrics, products ranking, and trends

### Dashboard Features

- **Key Metrics Card Grid**: Display top-level business metrics
- **Period Selector**: View analytics for today, this week, this month, or all time
- **Product Rankings Table**: Sorted by quantity sold
- **Daily Trend Table**: Shows daily performance over time
- **Real-time Updates**: All data updates automatically as new orders are completed

## Duplicate Prevention

The system prevents the same order from being processed multiple times:

### How It Works

1. Each order is checked for the `analyticsProcessed` flag
2. If `analyticsProcessed === true`, the order is skipped
3. After successful processing, the flag is set to `true`
4. An `analyticsProcessedAt` timestamp is also recorded

### Override (if needed)

If you need to reprocess an order's analytics:

```javascript
// Delete the flag from the order
await fetchWithAppCheck(dbUrl(`{branchId}/logs/{orderId}/analyticsProcessed`), {
  method: 'DELETE',
});

// Then the processor will pick it up again on the next cycle
```

## Error Handling

The system includes safe handling for:

- **Empty order lists**: Returns default values (0 or empty strings)
- **Missing analytics structure**: Initializes on first order
- **Invalid data types**: Filters and validates before calculations
- **Concurrent updates**: Uses Firebase transactions for consistency
- **Network failures**: Returns cached data or defaults

## Performance Considerations

### Optimization Strategies

1. **Lazy Loading**: Analytics data is fetched on-demand
2. **Real-time Listeners**: Only active when dashboard is open
3. **Transactions**: Minimize lock time by processing in batches
4. **Indexed Queries**: Date-based keys enable efficient range queries

### Scalability

The system is designed to handle:
- Unlimited number of orders
- Multiple concurrent updates
- Long-term historical data
- Thousands of products

Firebase Realtime Database scales automatically, but consider Firebase pricing with high-volume data.

## Development Notes

### Adding New Metrics

To add a new metric to analytics:

1. **Update the transaction logic** in `analyticsApi.js` `processOrderAnalytics()` function
2. **Add fetcher function** to retrieve the new metric
3. **Add real-time listener** if needed for dashboard
4. **Update AnalyticsDashboard** component to display the metric
5. **Test** with sample orders

### Testing Analytics

Create a sample order to test:

```javascript
// In Firebase Console or via API:
POST {branchId}/logs/{testOrderId}
{
  "customerName": "Test Customer",
  "timestamp": "2026-06-10T10:30:00+08:00",
  "items": [
    {
      "itemId": "test_item",
      "name": "Test Product",
      "quantity": 1,
      "price": 100
    }
  ],
  "total": 100,
  "paymentMethod": "cash",
  "status": "completed"
}
```

Wait a moment, then check the analytics structure to verify updates.

## Troubleshooting

### Analytics Not Updating

1. **Check the hook is enabled**: Verify `useAnalyticsProcessor(branchId, true)` in BranchHomePage
2. **Verify order structure**: Order must have `total`, `items`, and `timestamp`
3. **Check Firebase permissions**: Ensure analytics path is readable/writable
4. **Look at console logs**: The processor logs errors to the console

### Analytics Missing Data

1. **Initialize manually**: Call `initializeAnalytics(branchId)` from console
2. **Reprocess orders**: Delete `analyticsProcessed` flag from old orders to reprocess
3. **Check timestamps**: Orders with invalid timestamps might not be processed correctly

### Performance Issues

1. **Reduce real-time listeners**: Don't keep dashboard open unnecessarily
2. **Archive old data**: Consider moving very old analytics to cold storage
3. **Optimize Firebase indexes**: Add composite indexes for date range queries

## Future Enhancements

Potential improvements to the analytics system:

- [ ] Comparison to previous periods (week-over-week, year-over-year)
- [ ] Customer segmentation and loyalty analytics
- [ ] Inventory forecasting based on sales trends
- [ ] Peak demand prediction
- [ ] Discount effectiveness analysis
- [ ] Payment method analysis
- [ ] Export analytics to CSV/PDF
- [ ] Custom date range reports
- [ ] Alerts for anomalies or thresholds

## Support

For issues or questions about the analytics system:

1. Check the Troubleshooting section above
2. Review console logs for detailed error messages
3. Verify Firebase Realtime Database structure matches expected format
4. Test with sample data from the Development Notes section
