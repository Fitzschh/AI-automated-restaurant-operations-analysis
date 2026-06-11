import { useState, useRef } from 'react';
import {
  addItemToFirebase,
  compressImage,
} from '../../lib/menuApi';
import CropModal from './CropModal';
import styles from './MenuPage.module.css';

export default function AddItemForm({ onItemAdded, categoryOptions, branchId }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImage, setCropImage] = useState(null);
  const [available, setAvailable] = useState(true);
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const options = categoryOptions || [];

  function handleImageChange(e) {
    const file = e.target.files?.[0] || null;
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCropImage(ev.target.result);
        setShowCropModal(true);
      };
      reader.readAsDataURL(file);
    }
  }

  const handleCropComplete = (croppedDataUrl) => {
    setImagePreview(croppedDataUrl);
    setShowCropModal(false);
    setCropImage(null);
  };

  function clearImage() {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!name?.trim() || !category) {
      setError('Name and category are required.');
      return;
    }

    const p = price === '' ? 0 : parseFloat(price);
    if (isNaN(p) || p < 0) {
      setError('Price must be 0 or higher.');
      return;
    }

    setSubmitting(true);
    try {
      const itemId = name.trim().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/\./g, '-')
        .replace(/\//g, '-');
      let imageUrl = '';

      if (imagePreview) {
        imageUrl = await compressImage(imagePreview);
      }

      await addItemToFirebase(branchId, category, itemId, {
        name: name.trim(),
        price: p,
        imageUrl,
        available,
        isBestSeller: false,
        id: itemId,
      });

      // Reset form
      setName('');
      setPrice('');
      clearImage();
      setAvailable(true);
      setCategory('');
      onItemAdded?.();
    } catch (err) {
      setError(err?.message || 'Failed to add item');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.addItemBox}>
      {showCropModal && (
        <CropModal
          image={cropImage}
          aspect={1}
          onCropComplete={handleCropComplete}
          onCancel={() => { setShowCropModal(false); setCropImage(null); }}
        />
      )}
      <h2>Add New Item</h2>
      <form onSubmit={handleSubmit}>
        <label htmlFor="itemName">Item Name</label>
        <input
          id="itemName"
          type="text"
          placeholder="e.g. Iced Americano"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <label htmlFor="itemPrice">Price (₱)</label>
        <input
          id="itemPrice"
          type="number"
          placeholder="Enter price"
          step="1"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />

        <label htmlFor="itemImage">Image</label>
        <div className={styles.imageUploadArea}>
          <input
            ref={fileInputRef}
            id="itemImage"
            type="file"
            accept=".jpeg,.jpg,.png,.webp"
            onChange={handleImageChange}
            className={styles.fileInputHidden}
          />
          <button
            type="button"
            className={styles.uploadBtn}
            onClick={() => fileInputRef.current?.click()}
          >
            {imagePreview ? 'Change Image' : 'Choose Image'}
          </button>
          {imagePreview && (
            <div className={styles.imagePreviewWrap}>
              <img src={imagePreview} alt="Preview" className={styles.imagePreview} />
              <button type="button" className={styles.clearImageBtn} onClick={clearImage}>✕</button>
            </div>
          )}
        </div>

        <label htmlFor="itemAvailability">Availability</label>
        <select
          id="itemAvailability"
          value={String(available)}
          onChange={(e) => setAvailable(e.target.value === 'true')}
          required
        >
          <option value="true">Available</option>
          <option value="false">Not Available</option>
        </select>

        <label htmlFor="itemCategory">Category</label>
        <select
          id="itemCategory"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
        >
          <option value="">Select Category</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>

        {error && <p className={styles.formError}>{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add Item'}
        </button>
      </form>
    </div>
  );
}
