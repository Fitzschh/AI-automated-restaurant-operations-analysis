import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { updateBackgroundTheme, updateBackgroundImage, compressImage, updateBranchUserNickname, onMenuLogsChange } from '../../lib/menuApi';
import { AUTH_CONFIG } from '../../config/authConfig';
import CropModal from './CropModal';
import MenuLogsModal from './MenuLogsModal';
import styles from './MenuPage.module.css';

export const THEMES = [
  { id: 'dark', label: 'Dark', color: 'rgba(0, 0, 40, 0.85)' },
  { id: 'light', label: 'Light', color: 'rgba(255, 255, 255, 0.9)' },
  { id: 'wooden', label: 'Wooden', color: 'rgba(101, 67, 33, 0.85)' },
  { id: 'ocean', label: 'Ocean', color: 'rgba(0, 77, 155, 0.85)' },
  { id: 'sunset', label: 'Sunset', color: 'rgba(255, 127, 80, 0.85)' },
];

export default function SettingsPanel({
  isOpen,
  onClose,
  currentTheme,
  currentImage,
  onSettingsUpdate,
  branchId,
  showNickname = true,
  mode = 'menu', // 'menu' or 'account'
  onNicknameUpdate
}) {
  const navigate = useNavigate();
  const { user, logout, nickname, updateNickname } = useAuth();
  const fileInputRef = useRef(null);
  const [selectedTheme, setSelectedTheme] = useState(currentTheme || 'dark');
  const [uploading, setUploading] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImage, setCropImage] = useState(null);
  const [nicknameInput, setNicknameInput] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showMenuLogs, setShowMenuLogs] = useState(false);
  const [menuLogs, setMenuLogs] = useState([]);

  // On mount or when panel opens, we should try to pre-fill the input
  // with the target user's nickname, but for simplicity we can fallback 
  // to the currently logged in user's nickname. 
  useEffect(() => {
    if (isOpen) {
      setNicknameInput(nickname || '');
      setSelectedTheme(currentTheme || 'dark');
    }
  }, [isOpen, nickname, currentTheme]);

  // Real-time listener for menu logs when panel is open
  useEffect(() => {
    if (!isOpen || !branchId) return;
    const unsubscribe = onMenuLogsChange(branchId, (data) => {
      setMenuLogs(data);
    });
    return unsubscribe;
  }, [isOpen, branchId]);

  async function handleThemeChange(themeId) {
    setSelectedTheme(themeId);
    setMessage({ type: '', text: '' });
    try {
      await updateBackgroundTheme(branchId, themeId);
      onSettingsUpdate?.();
      setMessage({ type: 'success', text: 'Theme updated!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Error updating theme' });
    }
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setMessage({ type: 'error', text: 'Please upload JPG, PNG, or WebP images only' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      setCropImage(evt.target.result);
      setShowCropModal(true);
    };
    reader.readAsDataURL(file);
  }

  const handleCropComplete = async (croppedDataUrl) => {
    setShowCropModal(false);
    setCropImage(null);
    setUploading(true);
    setMessage({ type: '', text: '' });
    try {
      const compressed = await compressImage(croppedDataUrl);
      await updateBackgroundImage(branchId, compressed);
      onSettingsUpdate?.();
      setMessage({ type: 'success', text: 'Background image updated!' });
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Error uploading image' });
    } finally {
      setUploading(false);
    }
  };

  async function handleNicknameSave() {
    setMessage({ type: '', text: '' });
    try {
      let success = false;
      const targetEmail = branchId ? AUTH_CONFIG.branches[branchId]?.email : null;

      if (targetEmail && user?.email !== targetEmail) {
        // Admin is updating a specific branch's user nickname
        success = await updateBranchUserNickname(targetEmail, nicknameInput);
      } else {
        // User is updating their own nickname (works for both Branch owners and Admins on their own account)
        success = await updateNickname(nicknameInput);
      }

      if (success) {
        setMessage({ type: 'success', text: 'Nickname updated!' });
        onNicknameUpdate?.(nicknameInput);
      } else {
        setMessage({ type: 'error', text: 'Error updating nickname' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error updating nickname' });
    }
  }

  function handleAction() {
    if (mode === 'account') {
      logout();
      navigate('/');
    } else {
      if (user?.email === 'fitzhofer@gmail.com') {
        navigate('/home-admin');
      } else {
        navigate(`/home/${branchId}`);
      }
    }
  }

  const isMenuMode = mode === 'menu';

  return (
    <>
      {/* Overlay */}
      {isOpen && <div className={styles.panelOverlay} onClick={onClose} />}

      {showCropModal && (
        <CropModal
          image={cropImage}
          aspect={16 / 9}
          onCropComplete={handleCropComplete}
          onCancel={() => { setShowCropModal(false); setCropImage(null); }}
        />
      )}

      {/* Side Panel */}
      <div className={`${styles.settingsPanel} ${isOpen ? styles.settingsPanelOpen : ''}`}>
        <div className={styles.panelHeader}>
          <h2>{isMenuMode ? 'Settings' : 'Account Configuration'}</h2>
          <button
            type="button"
            className={styles.panelCloseBtn}
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        <div className={styles.panelContent}>
          {/* Account Configuration */}
          {showNickname && (
            <div className={styles.settingSection}>
              <h3>{isMenuMode ? 'Account Configuration' : 'User Profile'}</h3>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
                Nickname
              </label>
              <div className={styles.nicknameInputGroup}>
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  placeholder="Enter your nickname"
                  className={styles.nicknameInput}
                />
                <button
                  type="button"
                  onClick={handleNicknameSave}
                  className={styles.saveBtn}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {isMenuMode && (
            <>
              {/* Theme Selection */}
              <div className={styles.settingSection}>
                <h3>Background Theme</h3>
                <div className={styles.themeGrid}>
                  {THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      className={`${styles.themeOption} ${selectedTheme === theme.id ? styles.themeOptionActive : ''}`}
                      onClick={() => handleThemeChange(theme.id)}
                      style={{ backgroundColor: theme.color }}
                      title={theme.label}
                    >
                      <span className={styles.themeName}>{theme.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Image Upload */}
              <div className={styles.settingSection}>
                <h3>Custom Background</h3>
                <p className={styles.settingDescription}>
                  Upload JPG, PNG, or WebP image
                </p>
                <div className={styles.uploadArea}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageUpload}
                    disabled={uploading}
                    className={styles.fileInput}
                  />
                  <button
                    type="button"
                    className={styles.uploadBtn}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading...' : 'Upload Image'}
                  </button>
                  {currentImage && (
                    <p className={styles.imageStatus}>Custom image is active</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Messages */}
          {message.text && (
            <p className={message.type === 'error' ? styles.msgError : styles.msgSuccess}>
              {message.text}
            </p>
          )}

          {/* Menu Logs Button — account mode only */}
          {!isMenuMode && branchId && (
            <div className={styles.settingSection}>
              <h3>Activity</h3>
              <button
                type="button"
                className={styles.menuLogsBtn}
                onClick={() => setShowMenuLogs(true)}
              >
                Menu Logs
              </button>
            </div>
          )}
        </div>

        {/* Panel Footer */}
        <div className={styles.panelFooter}>
          <button
            type="button"
            className={styles.logoutBtn}
            onClick={handleAction}
          >
            {isMenuMode ? 'Return to Home Page' : 'Logout'}
          </button>
        </div>
      </div>

      {/* Menu Logs Modal */}
      {showMenuLogs && (
        <MenuLogsModal
          logs={menuLogs}
          onClose={() => setShowMenuLogs(false)}
          branchLabel={branchId ? (AUTH_CONFIG.branches[branchId]?.name || branchId) : ''}
        />
      )}
    </>
  );
}
