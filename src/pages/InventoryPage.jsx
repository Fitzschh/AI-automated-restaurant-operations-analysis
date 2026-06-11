import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../components/layout/DashboardLayout';
import InventoryCard from '../components/inventory/InventoryCard';
import StockAdjustmentModal from '../components/inventory/StockAdjustmentModal';
import { onInventoryChange, syncInventoryWithMenu } from '../lib/inventoryApi';
import { SyncIcon, SearchIcon } from '../components/analytics/AnalyticsIcons';
import styles from '../components/inventory/InventoryPage.module.css';

export default function InventoryPage() {
  const { branchId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [inventory, setInventory] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all'); // all, healthy, low, out
  
  // Modal state
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);

  // Firebase listener
  useEffect(() => {
    if (!branchId) return;

    setLoading(true);
    const unsub = onInventoryChange(branchId, (data) => {
      setInventory(data || {});
      setLoading(false);
      
      // Update selected item if modal is open
      if (selectedItemId && data[selectedItemId]) {
        setSelectedItem(data[selectedItemId]);
      }
    });

    return () => unsub();
  }, [branchId, selectedItemId]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncInventoryWithMenu(branchId, user?.email);
      if (result.added > 0) {
        // Notification could go here
        console.log(`Synced ${result.added} new items to inventory`);
      }
    } catch (err) {
      console.error("Sync failed", err);
    } finally {
      setSyncing(false);
    }
  };

  const openModal = (itemId, item) => {
    setSelectedItemId(itemId);
    setSelectedItem(item);
  };

  const closeModal = () => {
    setSelectedItemId(null);
    setSelectedItem(null);
  };

  // Filter and sort items
  const displayItems = useMemo(() => {
    const itemsArray = Object.entries(inventory).map(([id, data]) => ({ id, ...data }));
    
    // Sort alphabetically
    itemsArray.sort((a, b) => (a.productName || a.id).localeCompare(b.productName || b.id));

    return itemsArray.filter(item => {
      // Apply search
      if (searchTerm && !(item.productName || item.id).toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      
      // Apply status filter
      const stock = item.currentStock || 0;
      const warning = item.warningLevel || 10;
      const critical = item.criticalLevel || 5;
      
      if (filter === 'healthy' && stock <= warning) return false;
      if (filter === 'low' && (stock > warning || stock <= critical)) return false;
      if (filter === 'out' && stock > critical) return false;
      
      return true;
    });
  }, [inventory, searchTerm, filter]);

  const inventoryEmpty = Object.keys(inventory).length === 0;

  if (loading && inventoryEmpty) {
    return (
      <DashboardLayout branchId={branchId}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <div className="spinner" style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout branchId={branchId}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Inventory Management</h1>
          <p className={styles.pageSubtitle}>Track stock levels across your menu items</p>
        </div>
        <button 
          className={styles.primaryBtn} 
          onClick={handleSync}
          disabled={syncing}
        >
          <SyncIcon size={16} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
          {syncing ? 'Syncing...' : 'Sync with Menu'}
        </button>
      </div>

      {!inventoryEmpty ? (
        <>
          <div className={styles.actionsRow}>
            <div className={styles.searchBox}>
              <SearchIcon size={16} className={styles.searchIcon} />
              <input 
                type="text" 
                placeholder="Search inventory..." 
                className={styles.searchInput}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div className={styles.filterTabs}>
              <button 
                className={`${styles.filterTab} ${filter === 'all' ? styles.active : ''}`}
                onClick={() => setFilter('all')}
              >
                All Items
              </button>
              <button 
                className={`${styles.filterTab} ${filter === 'healthy' ? styles.active : ''}`}
                onClick={() => setFilter('healthy')}
              >
                Healthy
              </button>
              <button 
                className={`${styles.filterTab} ${filter === 'low' ? styles.active : ''}`}
                onClick={() => setFilter('low')}
              >
                Low Stock
              </button>
              <button 
                className={`${styles.filterTab} ${filter === 'out' ? styles.active : ''}`}
                onClick={() => setFilter('out')}
              >
                Critical / Out
              </button>
            </div>
          </div>

          <div className={styles.inventoryGrid}>
            {displayItems.map(item => (
              <InventoryCard 
                key={item.id} 
                itemId={item.id} 
                item={item} 
                onClick={openModal} 
              />
            ))}
          </div>

          {displayItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
              No items match your search or filter.
            </div>
          )}

          <StockAdjustmentModal 
            isOpen={!!selectedItemId} 
            onClose={closeModal} 
            item={selectedItem} 
            itemId={selectedItemId}
            branchId={branchId}
            userId={user?.email}
          />
        </>
      ) : (
        <div className={styles.emptyState}>
          <InventoryIcon size={48} color="var(--color-text-muted)" />
          <div>
            <h2 className={styles.emptyStateTitle}>No Inventory Found</h2>
            <p className={styles.emptyStateText}>Your inventory tracking is currently empty. Click "Sync with Menu" to automatically create inventory records for all your existing menu items.</p>
          </div>
          <button className={styles.primaryBtn} onClick={handleSync} disabled={syncing}>
            <SyncIcon size={18} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Syncing...' : 'Sync with Menu'}
          </button>
        </div>
      )}
    </DashboardLayout>
  );
}

// Temporary icon for empty state if needed before importing correctly
function InventoryIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size||24} height={props.size||24} viewBox="0 0 24 24" fill="none" stroke={props.color||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <path d="M20 8h-9.5c-1.4 0-2.1 0-2.68.27a2.5 2.5 0 0 0-1.05 1.05C7 9.9 7 10.6 7 12v6c0 1.4 0 2.1.27 2.68a2.5 2.5 0 0 0 1.05 1.05C8.9 22 9.6 22 11 22h6c1.4 0 2.1 0 2.68-.27a2.5 2.5 0 0 0 1.05-1.05C21 20.1 21 19.4 21 18v-8a2 2 0 0 0-2-2" />
      <path d="M16 8V6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <line x1="12" y1="12" x2="12" y2="18" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}
