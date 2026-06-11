import { useState } from 'react';
import { renameCategory, removeCategory } from '../../lib/menuApi';
import ItemCard from './ItemCard';
import styles from './MenuPage.module.css';

function truncate(str, max = 40) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

export default function CategorySection({ categoryName, items, onUpdate, branchId }) {
  const [renaming, setRenaming] = useState(false);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);

  function startRename() {
    setEditName(categoryName);
    setRenaming(true);
  }

  function cancelRename() {
    setRenaming(false);
    setEditName('');
  }

  async function handleSaveRename(e) {
    e?.preventDefault();
    const trimmed = editName.trim();
    if (!trimmed || trimmed === categoryName) {
      cancelRename();
      return;
    }

    setLoading(true);
    try {
      await renameCategory(branchId, categoryName, trimmed);
      onUpdate?.();
      setRenaming(false);
    } catch (err) {
      alert(err?.message || 'Error renaming category');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm(`Remove category "${categoryName}" and all its items?`)) return;
    try {
      await removeCategory(branchId, categoryName);
      onUpdate?.();
    } catch (err) {
      alert(err?.message || 'Error removing category');
    }
  }

  const itemEntries = items && typeof items === 'object' ? Object.entries(items) : [];

  return (
    <div className={styles.categorySection}>
      <div className={styles.categorySectionHeader}>
        {renaming ? (
          <form className={styles.renameForm} onSubmit={handleSaveRename}>
            <input
              type="text"
              className={styles.renameInput}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
              disabled={loading}
            />
            <div className={styles.renameActions}>
              <button type="submit" className={styles.btnSave} disabled={loading}>
                {loading ? '...' : '✓'}
              </button>
              <button type="button" className={styles.btnCancel} onClick={cancelRename} disabled={loading}>
                ✕
              </button>
            </div>
          </form>
        ) : (
          <h2 title={categoryName}>{truncate(categoryName)}</h2>
        )}

        {!renaming && (
          <div className={styles.catActions}>
            <button
              type="button"
              onClick={startRename}
              className={styles.btnRename}
            >
              Rename
            </button>
            <button type="button" onClick={handleRemove} className={styles.btnRemoveCat}>
              Remove
            </button>
          </div>
        )}
      </div>

      {itemEntries.length === 0 ? (
        <p className={styles.emptyCategory}>
          No items yet — add one using the button above.
        </p>
      ) : (
        <div className={styles.itemsGrid}>
          {itemEntries.map(([itemKey, item]) => (
            <ItemCard
              key={itemKey}
              item={item}
              itemKey={itemKey}
              category={categoryName}
              onUpdate={onUpdate}
              branchId={branchId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
