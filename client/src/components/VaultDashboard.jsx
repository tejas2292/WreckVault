import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVault } from '../contexts/VaultContext';
import PasswordList from './PasswordList';
import PasswordModal from './PasswordModal';
import ProfilePage from './ProfilePage';
import SettingsPage from './SettingsPage';
import { LogOut, Plus, Search, User as UserIcon, LayoutGrid, Settings, Layers } from 'lucide-react';
import CATEGORIES from '../constants/categories';

const VaultDashboard = () => {
  const { logout, user } = useAuth();
  const { entries } = useVault();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingEntry, setEditingEntry] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  const [currentView, setCurrentView] = useState('dashboard');

  const categoryCounts = entries.reduce((acc, entry) => {
    const cat = entry.category || 'other';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

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
          <img src="/logo.png" alt="Logo" style={{ width: '40px', height: '40px' }} />
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
          <div 
            className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentView('settings')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Settings size={18} />
              <span>Settings</span>
            </div>
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user.profile_image ? (
                <img src={user.profile_image} alt="User" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              ) : (
                user.username[0].toUpperCase()
              )}
            </div>
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

            <div className="category-filter-bar">
              <button
                className={`category-pill ${selectedCategory === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                <Layers size={14} />
                All
                <span className="pill-count">{entries.length}</span>
              </button>
              {CATEGORIES.map((cat) => {
                const count = categoryCounts[cat.key] || 0;
                if (count === 0) return null;
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.key}
                    className={`category-pill ${selectedCategory === cat.key ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat.key)}
                    style={selectedCategory === cat.key ? { borderColor: cat.color, background: `${cat.color}15`, color: cat.color } : {}}
                  >
                    <Icon size={14} style={{ color: selectedCategory === cat.key ? cat.color : undefined }} />
                    {cat.label}
                    <span className="pill-count">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="content-area">
              <PasswordList searchQuery={searchQuery} onEditEntry={handleEditEntry} selectedCategory={selectedCategory} />
            </div>
          </>
        ) : currentView === 'profile' ? (
          <ProfilePage />
        ) : (
          <SettingsPage />
        )}
      </main>

      {isModalOpen && <PasswordModal onClose={handleCloseModal} initialData={editingEntry} />}
    </div>
  );
};

export default VaultDashboard;
