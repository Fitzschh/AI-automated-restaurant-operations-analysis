import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SettingsPanel from '../components/menu/SettingsPanel';

export default function AdminHomePage() {
    const navigate = useNavigate();
    const { logout, nickname } = useAuth();
    const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

    function handleLogout() {
        logout();
        navigate('/');
    }

    const branches = [
        { id: 'branch1', label: 'Branch 1' },
        { id: 'branch2', label: 'Branch 2' }
    ];

    const containerStyle = {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1a2e',
        color: '#fff',
        fontFamily: '"Google Sans", sans-serif',
        padding: '20px'
    };

    return (
        <div style={containerStyle}>
            <SettingsPanel
                isOpen={settingsPanelOpen}
                onClose={() => setSettingsPanelOpen(false)}
                mode="account"
                showNickname={true}
            />

            <header className="slide-up slide-up-d1" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', position: 'absolute', top: 0 }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Hello {nickname || 'Admin'}</div>
                <button
                    onClick={() => setSettingsPanelOpen(true)}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'white',
                        padding: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                    }}
                >
                    <span style={{ width: '24px', height: '2.5px', background: '#fff', borderRadius: '2px' }}></span>
                    <span style={{ width: '24px', height: '2.5px', background: '#fff', borderRadius: '2px' }}></span>
                    <span style={{ width: '24px', height: '2.5px', background: '#fff', borderRadius: '2px' }}></span>
                </button>
            </header>

            <h1 className="slide-up slide-up-d2" style={{ fontSize: '2.5rem', marginBottom: '40px' }}>Admin Dashboard</h1>

            <div className="slide-up slide-up-d3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', width: '100%', maxWidth: '800px', marginBottom: '40px' }}>
                {branches.map(branch => (
                    <div
                        key={branch.id}
                        onClick={() => navigate(`/menu/${branch.id}`)}
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            padding: '30px',
                            borderRadius: '16px',
                            backdropFilter: 'blur(10px)',
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'transform 0.2s',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                        onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        <h2 style={{ margin: 0 }}>{branch.label}</h2>
                        <p style={{ color: '#aaa', marginTop: '10px' }}>Manage {branch.label}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
