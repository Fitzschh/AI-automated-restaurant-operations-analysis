import { useState } from 'react';
import {
  deleteItem,
  updateItem,
  setBestSeller,
  updateImageInFirebase,
  compressImage,
} from '../../lib/menuApi';
import CropModal from './CropModal';
import styles from './MenuPage.module.css';

function truncate(str, max = 40) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function triggerFileInput(onFile) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.jpeg,.jpg,.png,.webp';
  input.onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };
  input.click();
}

export default function ItemCard({ item, itemKey, category, onUpdate, variant, branchId }) {
  const [busy, setBusy] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImage, setCropImage] = useState(null);
  const available = item.available === true || item.available === 'true';
  const isBestSeller = item.isBestSeller === true;
  const isBestSellerVariant = variant === 'bestseller';

  async function handleAction(action) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      onUpdate?.();
    } catch (err) {
      alert(err?.message || 'An error occurred');
    } finally {
      setBusy(false);
    }
  }

  function handleDelete() {
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    handleAction(() => deleteItem(branchId, category, itemKey));
  }

  function handleToggleAvailability() {
    handleAction(() => updateItem(branchId, category, itemKey, { ...item, available: !available }));
  }

  function handleToggleBestSeller() {
    handleAction(() => setBestSeller(branchId, category, itemKey, !isBestSeller));
  }

  function handleChangePhoto() {
    triggerFileInput(async (file) => {
      const dataUrl = await readFileAsDataUrl(file);
      setCropImage(dataUrl);
      setShowCropModal(true);
    });
  }

  async function handleCropComplete(croppedDataUrl) {
    setShowCropModal(false);
    setCropImage(null);
    setBusy(true);
    try {
      const compressed = await compressImage(croppedDataUrl);
      await updateImageInFirebase(branchId, category, itemKey, compressed);
      onUpdate?.();
    } catch (err) {
      alert(err?.message || 'Error updating image');
    } finally {
      setBusy(false);
    }
  }

  const cardClass = isBestSellerVariant ? styles.bestSellerCard : styles.itemCard;
  const imageClass = isBestSellerVariant ? styles.bestSellerImage : styles.itemImage;
  const placeholderClass = isBestSellerVariant ? styles.bestSellerImagePlaceholder : styles.itemImagePlaceholder;

  return (
    <div className={`${cardClass} ${busy ? styles.cardBusy : ''}`}>
      {showCropModal && (
        <CropModal
          image={cropImage}
          aspect={1}
          onCropComplete={handleCropComplete}
          onCancel={() => { setShowCropModal(false); setCropImage(null); }}
        />
      )}

      {isBestSeller && !isBestSellerVariant && (
        <span className={styles.bestSellerBadge}>★ Best Seller</span>
      )}
      {isBestSellerVariant && (
        <span className={styles.bestSellerBadge}>★ Best Seller</span>
      )}

      {item.imageUrl?.trim() ? (
        <img src={item.imageUrl} alt={item.name} className={imageClass} loading="lazy" />
      ) : (
        <div className={placeholderClass}>No Image</div>
      )}

      <div className={isBestSellerVariant ? styles.bestSellerInfo : undefined}>
        <h3 title={item.name}>{truncate(item.name)}</h3>
        <p className={styles.priceTag}>₱{Number(item.price).toLocaleString()}</p>
        <p className={available ? styles.availYes : styles.availNo}>
          {available ? '● Available' : '○ Not Available'}
        </p>
      </div>

      {!isBestSellerVariant && (
        <div className={styles.itemActions}>
          <button
            type="button"
            onClick={handleToggleBestSeller}
            disabled={busy}
            className={isBestSeller ? styles.btnBestSellerOff : styles.btnAddBest}
          >
            {isBestSeller ? '★ Unbest' : '☆ Best Seller'}
          </button>
          <button
            type="button"
            onClick={handleChangePhoto}
            disabled={busy}
            className={styles.btnPhoto}
          >
            Photo
          </button>
          <button
            type="button"
            onClick={handleToggleAvailability}
            disabled={busy}
            className={available ? styles.btnUnavail : styles.btnAvail}
          >
            {available ? 'Unavail' : 'Avail'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className={styles.btnDelete}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
