import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVault } from '../contexts/VaultContext';
import PasswordList from './PasswordList';
import PasswordModal from './PasswordModal';
import ProfilePage from './ProfilePage';
import { LogOut, Plus, Search, ShieldCheck, User as UserIcon, LayoutGrid } from 'lucide-react';

const VaultDashboard = () => {
  const { logout, user } = useAuth();
  const { refresh } = useVault();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingEntry, setEditingEntry] = useState(null);
  
  // Simple Router
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' | 'profile'

  const handleEditEntry = (entry) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingEntry(null);
  };

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <ShieldCheck size={32} className="logo-icon" />
          <h2>WreckVault</h2>
        </div>
        <nav className="sidebar-nav">
          <div 
            className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentView('dashboard')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <LayoutGrid size={18} />
              <span>Vault</span>
            </div>
          </div>
          <div 
            className={`nav-item ${currentView === 'profile' ? 'active' : ''}`}
            onClick={() => setCurrentView('profile')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <UserIcon size={18} />
              <span>Profile</span>
            </div>
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{user.username[0].toUpperCase()}</div>
            <span>{user.username}</span>
          </div>
          <button onClick={logout} className="logout-btn" title="Logout">
            <LogOut size={20} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        {currentView === 'dashboard' ? (
          <>
            <header className="top-bar">
              <div className="search-bar">
                <Search size={20} />
                <input 
                  type="text" 
                  placeholder="Search vault..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button className="btn-primary" onClick={() => { setEditingEntry(null); setIsModalOpen(true); }}>
                <Plus size={20} />
                Add Item
              </button>
            </header>

            <div className="content-area">
              <PasswordList searchQuery={searchQuery} onEditEntry={handleEditEntry} />
            </div>
          </>
        ) : (
          <ProfilePage />
        )}
      </main>

      {isModalOpen && <PasswordModal onClose={handleCloseModal} initialData={editingEntry} />}
    </div>
  );
};

export default VaultDashboard;
