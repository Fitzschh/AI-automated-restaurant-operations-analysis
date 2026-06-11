import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import styles from './MenuPage.module.css';

/**
 * Reusable Crop Modal
 * @param {string} image - The image data URL to crop
 * @param {number} aspect - Aspect ratio (e.g. 1 for square, 16/9 for background)
 * @param {function} onCropComplete - Callback with the final data URL
 * @param {function} onCancel - Callback to close without saving
 */
export default function CropModal({ image, aspect = 1, onCropComplete, onCancel }) {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

    const onCropChange = useCallback((c) => setCrop(c), []);
    const onZoomChange = useCallback((z) => setZoom(z), []);

    const onCropAreaComplete = useCallback((_, pixels) => {
        setCroppedAreaPixels(pixels);
    }, []);

    const handleSave = async () => {
        try {
            if (!croppedAreaPixels) return;
            const croppedImage = await getCroppedImg(image, croppedAreaPixels);
            onCropComplete(croppedImage);
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className={styles.cropModalOverlay}>
            <div className={styles.cropModalContent}>
                <div className={styles.cropperContainer}>
                    <Cropper
                        image={image}
                        crop={crop}
                        zoom={zoom}
                        aspect={aspect}
                        onCropChange={onCropChange}
                        onZoomChange={onZoomChange}
                        onCropComplete={onCropAreaComplete}
                    />
                </div>

                <div className={styles.cropControls}>
                    <div className={styles.zoomSliderWrap}>
                        <label>Zoom</label>
                        <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.1}
                            value={zoom}
                            onChange={(e) => onZoomChange(Number(e.target.value))}
                            className={styles.zoomSlider}
                        />
                    </div>

                    <div className={styles.cropActions}>
                        <button type="button" className={styles.cropCancelBtn} onClick={onCancel}>
                            Cancel
                        </button>
                        <button type="button" className={styles.cropSaveBtn} onClick={handleSave}>
                            Crop & Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Utility to generate the cropped image
 */
async function getCroppedImg(imageSrc, pixelCrop) {
    const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.addEventListener('load', () => resolve(img));
        img.addEventListener('error', (error) => reject(error));
        img.setAttribute('crossOrigin', 'anonymous');
        img.src = imageSrc;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
    );

    return canvas.toDataURL('image/jpeg', 0.9); // Use high quality for the crop result
}
