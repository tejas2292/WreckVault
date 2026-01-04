import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVault } from '../contexts/VaultContext';
import PasswordList from './PasswordList';
import PasswordModal from './PasswordModal';
import { LogOut, Plus, Search, ShieldCheck } from 'lucide-react';

const VaultDashboard = () => {
  const { logout, user } = useAuth();
  const { refresh } = useVault();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <ShieldCheck size={32} className="logo-icon" />
          <h2>WreckVault</h2>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-item active">All Items</div>
          {/* Future: Folders, Favorites */}
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
          <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={20} />
            Add Item
          </button>
        </header>

        <div className="content-area">
          <PasswordList searchQuery={searchQuery} />
        </div>
      </main>

      {isModalOpen && <PasswordModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
};

export default VaultDashboard;
