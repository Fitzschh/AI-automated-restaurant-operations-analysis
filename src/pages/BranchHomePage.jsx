import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useAnalyticsProcessor } from '../hooks/useAnalyticsProcessor';
import { loadAppSettings, deleteLogToBin, clearDeletedLogs, onLogsChange, onDeletedLogsChange } from '../lib/menuApi';
import { AUTH_CONFIG } from '../config/authConfig';
import DashboardLayout from '../components/layout/DashboardLayout';
import SettingsPanel from '../components/menu/SettingsPanel';
import OrderLogCard from '../components/orders/OrderLogCard';
import OrderDetailModal from '../components/orders/OrderDetailModal';
import TrashBinModal from '../components/orders/TrashBinModal';
import { TrashIcon, SettingsIcon } from '../components/analytics/AnalyticsIcons';
import styles from '../components/orders/OrderLogs.module.css';

export default function BranchHomePage() {
    const { branchId } = useParams();
    const navigate = useNavigate();
    const { user, nickname, updateNickname, changePassword, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    
    // Enable real-time analytics processing for this branch
    useAnalyticsProcessor(branchId, true);
    
    const [appSettings, setAppSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

    // Order logs state
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(true);
    const [selectedLog, setSelectedLog] = useState(null);

    // Trash bin state
    const [deletedLogs, setDeletedLogs] = useState([]);
    const [isTrashOpen, setIsTrashOpen] = useState(false);
    const [clearingTrash, setClearingTrash] = useState(false);

    const [localNickname, setLocalNickname] = useState('');

    // Settings form state
    const [showSettings, setShowSettings] = useState(false);
    const [nicknameInput, setNicknameInput] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [settingsMsg, setSettingsMsg] = useState({ type: '', text: '' });

    useEffect(() => {
        if (!localNickname && nickname) {
            setLocalNickname(nickname);
            setNicknameInput(nickname);
        }
    }, [nickname]);

    useEffect(() => {
        async function load() {
            try {
                if (branchId) {
                    const settings = await loadAppSettings(branchId);
                    setAppSettings(settings);
                }
            } catch (err) {
                console.error('Error loading branch settings:', err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [branchId]);

    // Real-time listener for order logs
    useEffect(() => {
        if (!branchId) return;
        setLogsLoading(true);
        const unsubscribe = onLogsChange(branchId, (data) => {
            setLogs(data);
            setLogsLoading(false);
        });
        return unsubscribe;
    }, [branchId]);

    // Real-time listener for deleted logs
    useEffect(() => {
        if (!branchId) return;
        const unsubscribe = onDeletedLogsChange(branchId, (data) => {
            setDeletedLogs(data);
        });
        return unsubscribe;
    }, [branchId]);

    async function handleDeleteLog(orderNum, logData) {
        try {
            await deleteLogToBin(branchId, orderNum, logData);
        } catch (err) {
            console.error('Error moving to trash:', err);
        }
    }

    async function handleClearBin() {
        setClearingTrash(true);
        try {
            await clearDeletedLogs(branchId);
        } catch (err) {
            console.error('Error clearing trash:', err);
        } finally {
            setClearingTrash(false);
        }
    }

    async function handleNicknameSave() {
        setSettingsMsg({ type: '', text: '' });
        if (!nicknameInput.trim()) return;
        try {
            const success = await updateNickname(nicknameInput.trim());
            if (success) {
                setLocalNickname(nicknameInput.trim());
                setSettingsMsg({ type: 'success', text: 'Nickname updated!' });
            } else {
                setSettingsMsg({ type: 'error', text: 'Error updating nickname' });
            }
        } catch (err) {
            setSettingsMsg({ type: 'error', text: 'Error updating nickname' });
        }
    }

    async function handlePasswordChange() {
        setSettingsMsg({ type: '', text: '' });
        if (!newPassword || newPassword.length < 6) {
            setSettingsMsg({ type: 'error', text: 'Password must be at least 6 characters' });
            return;
        }
        if (newPassword !== confirmPassword) {
            setSettingsMsg({ type: 'error', text: 'Passwords do not match' });
            return;
        }
        try {
            const success = await changePassword(newPassword);
            if (success) {
                setNewPassword('');
                setConfirmPassword('');
                setSettingsMsg({ type: 'success', text: 'Password updated successfully!' });
            } else {
                setSettingsMsg({ type: 'error', text: 'Failed to update password. You may need to log out and log back in first.' });
            }
        } catch (err) {
            setSettingsMsg({ type: 'error', text: err.message || 'Error updating password' });
        }
    }

    if (loading) return (
        <DashboardLayout branchId={branchId}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </DashboardLayout>
    );

    const branchName = AUTH_CONFIG.branches[branchId]?.name || branchId;

    /* Shared inline styles for settings cards */
    const cardStyle = {
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        marginBottom: 'var(--space-4)',
    };
    const labelStyle = { display: 'block', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' };
    const inputStyle = {
        width: '100%', padding: '10px 14px',
        background: 'var(--color-bg-input)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)',
        fontFamily: 'inherit', fontSize: '0.95rem',
    };
    const btnStyle = {
        padding: '8px 20px', background: 'var(--color-accent)', color: '#fff',
        border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
        fontWeight: 600, fontSize: '0.85rem', marginTop: 'var(--space-3)',
    };

    return (
        <DashboardLayout branchId={branchId}>
            <SettingsPanel
                isOpen={settingsPanelOpen}
                onClose={() => setSettingsPanelOpen(false)}
                currentTheme={appSettings?.backgroundTheme}
                currentImage={appSettings?.backgroundImage}
                branchId={branchId}
                showNickname={true}
                mode="account"
                onNicknameUpdate={(newNickname) => {
                    setLocalNickname(newNickname);
                    setNicknameInput(newNickname);
                }}
                onSettingsUpdate={async () => {
                    const settings = await loadAppSettings(branchId);
                    setAppSettings(settings);
                }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Welcome to {branchName}</h1>
                    <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', margin: 'var(--space-1) 0 0 0' }}>Manage orders and operations.</p>
                </div>
                <button
                    onClick={() => setShowSettings(!showSettings)}
                    title="Settings"
                    style={{
                        background: showSettings ? 'var(--color-accent-subtle)' : 'var(--color-bg-elevated)',
                        border: '1px solid var(--color-border)',
                        color: showSettings ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                        borderRadius: 'var(--radius-md)',
                        padding: '8px 16px',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '6px',
                        fontWeight: 600, fontSize: '0.85rem',
                    }}
                >
                    <SettingsIcon size={16} />
                    Settings
                </button>
            </div>

            {/* ===== Settings Section ===== */}
            {showSettings && (
                <section style={{ marginBottom: 'var(--space-7)' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 var(--space-4) 0' }}>Account Settings</h2>

                    {/* Nickname */}
                    <div style={cardStyle}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 var(--space-3) 0' }}>Display Name</h3>
                        <label style={labelStyle}>Nickname</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={nicknameInput}
                                onChange={(e) => setNicknameInput(e.target.value)}
                                placeholder="Enter your nickname"
                                style={{ ...inputStyle, flex: 1 }}
                            />
                            <button onClick={handleNicknameSave} style={btnStyle}>Save</button>
                        </div>
                    </div>

                    {/* Password */}
                    <div style={cardStyle}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 var(--space-3) 0' }}>Change Password</h3>
                        <div style={{ marginBottom: 'var(--space-3)' }}>
                            <label style={labelStyle}>New Password</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="At least 6 characters"
                                style={inputStyle}
                            />
                        </div>
                        <div style={{ marginBottom: 'var(--space-2)' }}>
                            <label style={labelStyle}>Confirm Password</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Re-enter password"
                                style={inputStyle}
                            />
                        </div>
                        <button onClick={handlePasswordChange} style={btnStyle}>Update Password</button>
                    </div>

                    {/* Theme */}
                    <div style={cardStyle}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 var(--space-3) 0' }}>Theme</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0 0 var(--space-3) 0' }}>
                            Current theme: <strong>{theme === 'light' ? 'Light Mode' : 'Dark Mode'}</strong>
                        </p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={() => { if (theme !== 'light') toggleTheme(); }}
                                style={{
                                    ...btnStyle,
                                    marginTop: 0,
                                    background: theme === 'light' ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                                    color: theme === 'light' ? '#fff' : 'var(--color-text-secondary)',
                                    border: theme === 'light' ? 'none' : '1px solid var(--color-border)',
                                }}
                            >
                                Light
                            </button>
                            <button
                                onClick={() => { if (theme !== 'dark') toggleTheme(); }}
                                style={{
                                    ...btnStyle,
                                    marginTop: 0,
                                    background: theme === 'dark' ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                                    color: theme === 'dark' ? '#fff' : 'var(--color-text-secondary)',
                                    border: theme === 'dark' ? 'none' : '1px solid var(--color-border)',
                                }}
                            >
                                Dark
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    {settingsMsg.text && (
                        <p style={{
                            padding: '10px 14px',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            background: settingsMsg.type === 'error' ? 'var(--color-danger-subtle)' : 'var(--color-success-subtle)',
                            color: settingsMsg.type === 'error' ? 'var(--color-danger)' : 'var(--color-success)',
                        }}>
                            {settingsMsg.text}
                        </p>
                    )}
                </section>
            )}

            {/* Order Logs Body */}
            <section className={`slide-up slide-up-d2 ${styles.logsSection}`} style={{ padding: 0 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 var(--space-4) 0' }}>Recent Orders</h2>

                {logsLoading ? (
                    <div className={styles.emptyState}>Loading order logs...</div>
                ) : logs.length === 0 ? (
                    <div className={styles.emptyState}>No order logs yet.</div>
                ) : (
                    <div className={styles.logsGrid}>
                        {logs.map(log => (
                            <OrderLogCard
                                key={log.orderNum}
                                log={log}
                                onClick={() => setSelectedLog(log)}
                                onDelete={handleDeleteLog}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* Floating Trash Bin Button */}
            <button
                className={`slide-up slide-up-d3 ${styles.trashBinBtn}`}
                onClick={() => setIsTrashOpen(true)}
                title="View Trash Bin"
                style={{ position: 'fixed', bottom: '30px', right: '30px', left: 'auto', zIndex: 90 }}
            >
                <TrashIcon size={20} />
            </button>

            {/* Detail Modal */}
            {selectedLog && (
                <OrderDetailModal
                    log={selectedLog}
                    onClose={() => setSelectedLog(null)}
                />
            )}

            {/* Trash Bin Modal */}
            {isTrashOpen && (
                <TrashBinModal
                    logs={deletedLogs}
                    onClose={() => setIsTrashOpen(false)}
                    onClearBin={handleClearBin}
                    clearing={clearingTrash}
                />
            )}
        </DashboardLayout>
    );
}
