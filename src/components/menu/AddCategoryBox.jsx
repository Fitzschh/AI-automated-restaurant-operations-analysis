import { useState } from 'react';
import { addCategory } from '../../lib/menuApi';
import styles from './MenuPage.module.css';

export default function AddCategoryBox({ onCategoryAdded, branchId }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  async function handleAdd(e) {
    e?.preventDefault();
    setMessage({ type: '', text: '' });
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage({ type: 'error', text: 'Please enter a category name' });
      return;
    }
    setLoading(true);
    try {
      await addCategory(branchId, trimmed);
      setName('');
      setMessage({ type: 'success', text: `"${trimmed}" added!` });
      onCategoryAdded?.();
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Error adding category' });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleAdd(e);
  }

  return (
    <div className={styles.categoryBox}>
      <h2>Add New Category</h2>
      <div className={styles.addCategoryRow}>
        <input
          type="text"
          id="newCategoryName"
          placeholder="e.g. Desserts, Beverages"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" onClick={handleAdd} disabled={loading}>
          {loading ? 'Adding…' : '+ Add'}
        </button>
      </div>
      {message.text && (
        <p className={message.type === 'error' ? styles.msgError : styles.msgSuccess}>
          {message.text}
        </p>
      )}
    </div>
  );
}
