import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVault } from '../contexts/VaultContext';
import PasswordList from './PasswordList';
import PasswordModal from './PasswordModal';
import CardList from './CardList';
import CardModal from './CardModal';
import NoteList from './NoteList';
import NoteModal from './NoteModal';
import PasswordGeneratorPage from './PasswordGeneratorPage';
import ProfilePage from './ProfilePage';
import SettingsPage from './SettingsPage';
import {
  LogOut, Plus, Search, User as UserIcon, LayoutGrid, Settings,
  Layers, Key, CreditCard, FileText, Star, ChevronDown, Sparkles, Menu
} from 'lucide-react';
import CATEGORIES from '../constants/categories';

const VaultDashboard = () => {
  const { logout, user } = useAuth();
  const { entries } = useVault();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('password');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingEntry, setEditingEntry] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [activeTab, setActiveTab] = useState('passwords');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);

  const [currentView, setCurrentView] = useState('dashboard');

  const passwordEntries = entries.filter(e => !e.entry_type || e.entry_type === 'password');
  const cardEntries = entries.filter(e => e.entry_type === 'card');
  const noteEntries = entries.filter(e => e.entry_type === 'note');
  const favCount = entries.filter(e => e.is_favorite).length;

  const categoryCounts = passwordEntries.reduce((acc, entry) => {
    const cat = entry.category || 'other';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const handleEditEntry = (entry) => {
    setEditingEntry(entry);
    setModalType(entry.entry_type || 'password');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingEntry(null);
  };

  const handleAdd = (type) => {
    setEditingEntry(null);
    setModalType(type);
    setIsModalOpen(true);
    setAddMenuOpen(false);
  };

  const handleNavigate = (view) => {
    setCurrentView(view);
    setMobileMenuOpen(false);
    setAvatarMenuOpen(false);
    setAddMenuOpen(false);
  };

  const handleLogout = () => {
    setMobileMenuOpen(false);
    setAvatarMenuOpen(false);
    setAddMenuOpen(false);
    logout();
  };

  const renderModal = () => {
    if (!isModalOpen) return null;
    if (modalType === 'card') return <CardModal onClose={handleCloseModal} initialData={editingEntry} />;
    if (modalType === 'note') return <NoteModal onClose={handleCloseModal} initialData={editingEntry} />;
    return <PasswordModal onClose={handleCloseModal} initialData={editingEntry} />;
  };

  return (
    <div className="dashboard-layout">
      {mobileMenuOpen && (
        <div
          className="nav-backdrop"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <nav className="navbar">
        <div className="navbar-left">
          <button
            className="navbar-hamburger"
            onClick={() => { setMobileMenuOpen(!mobileMenuOpen); setAvatarMenuOpen(false); setAddMenuOpen(false); }}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          <div className="navbar-brand" onClick={() => handleNavigate('dashboard')}>
            <img src="/logo.png" alt="Logo" />
            <span>WreckVault</span>
          </div>

          <div className="navbar-links">
            <button
              className={`navbar-link ${currentView === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleNavigate('dashboard')}
            >
              <LayoutGrid size={16} />
              Vault
            </button>
            <button
              className={`navbar-link ${currentView === 'generator' ? 'active' : ''}`}
              onClick={() => handleNavigate('generator')}
            >
              <Sparkles size={16} />
              Generator
            </button>
          </div>
        </div>

        <div className="navbar-right">
          {currentView === 'dashboard' ? (
            <div className="navbar-search">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search vault..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          ) : (
            <div className="navbar-title">
              {currentView === 'generator' && 'Generator'}
              {currentView === 'profile' && 'Profile'}
              {currentView === 'settings' && 'Settings'}
            </div>
          )}

          {currentView === 'dashboard' && (
            <button
              className={`fav-filter-btn ${showFavoritesOnly ? 'active' : ''}`}
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              title="Show favorites only"
            >
              <Star size={16} fill={showFavoritesOnly ? '#ffa502' : 'none'} />
              {favCount > 0 && <span className="fav-count">{favCount}</span>}
            </button>
          )}

          {currentView === 'dashboard' && (
            <div className="add-menu-wrap" style={{ position: 'relative' }}>
              <button
                className="btn-primary"
                onClick={() => { setAddMenuOpen(!addMenuOpen); setMobileMenuOpen(false); setAvatarMenuOpen(false); }}
              >
                <Plus size={16} />
                <span className="add-btn-text">Add</span>
                <ChevronDown size={14} />
              </button>
              {addMenuOpen && (
                <>
                  <div className="add-menu-backdrop" onClick={() => setAddMenuOpen(false)} />
                  <div className="add-menu-dropdown">
                    <button onClick={() => handleAdd('password')}>
                      <Key size={16} /> Password
                    </button>
                    <button onClick={() => handleAdd('card')}>
                      <CreditCard size={16} /> Card
                    </button>
                    <button onClick={() => handleAdd('note')}>
                      <FileText size={16} /> Note
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="avatar-menu">
            <button
              className="avatar-btn"
              onClick={() => { setAvatarMenuOpen(!avatarMenuOpen); setMobileMenuOpen(false); setAddMenuOpen(false); }}
              title={user.username}
            >
              <div className="user-avatar">
                {user.profile_image ? (
                  <img
                    src={user.profile_image}
                    alt="User"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                  />
                ) : (
                  user.username[0].toUpperCase()
                )}
              </div>
            </button>

            {avatarMenuOpen && (
              <>
                <div className="nav-menu-backdrop" onClick={() => setAvatarMenuOpen(false)} />
                <div className="avatar-dropdown">
                  <div className="avatar-dropdown-header">
                    <UserIcon size={16} />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{user.username}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Account</span>
                    </div>
                  </div>
                  <button onClick={() => handleNavigate('profile')}>
                    <UserIcon size={16} /> Profile
                  </button>
                  <button onClick={() => handleNavigate('settings')}>
                    <Settings size={16} /> Settings
                  </button>
                  <div className="avatar-dropdown-divider" />
                  <button className="danger" onClick={handleLogout}>
                    <LogOut size={16} /> Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="mobile-nav-dropdown">
            <button onClick={() => handleNavigate('dashboard')}>
              <LayoutGrid size={16} /> Vault
            </button>
            <button onClick={() => handleNavigate('generator')}>
              <Sparkles size={16} /> Generator
            </button>
            <div className="avatar-dropdown-divider" />
            <button onClick={() => handleNavigate('profile')}>
              <UserIcon size={16} /> Profile
            </button>
            <button onClick={() => handleNavigate('settings')}>
              <Settings size={16} /> Settings
            </button>
            <button className="danger" onClick={handleLogout}>
              <LogOut size={16} /> Logout
            </button>
          </div>
        )}
      </nav>

      <main className="main-content">
        {currentView === 'dashboard' ? (
          <>
            {/* Type Tabs */}
            <div className="type-tabs-bar">
              <button className={`type-tab ${activeTab === 'passwords' ? 'active' : ''}`}
                onClick={() => { setActiveTab('passwords'); setShowFavoritesOnly(false); }}>
                <Key size={14} /> Passwords
                <span className="tab-count">{passwordEntries.length}</span>
              </button>
              <button className={`type-tab ${activeTab === 'cards' ? 'active' : ''}`}
                onClick={() => { setActiveTab('cards'); setShowFavoritesOnly(false); }}>
                <CreditCard size={14} /> Cards
                <span className="tab-count">{cardEntries.length}</span>
              </button>
              <button className={`type-tab ${activeTab === 'notes' ? 'active' : ''}`}
                onClick={() => { setActiveTab('notes'); setShowFavoritesOnly(false); }}>
                <FileText size={14} /> Notes
                <span className="tab-count">{noteEntries.length}</span>
              </button>
            </div>

            {/* Category filter pills (only for passwords) */}
            {activeTab === 'passwords' && !showFavoritesOnly && (
              <div className="category-filter-bar">
                <button className={`category-pill ${selectedCategory === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedCategory('all')}>
                  <Layers size={12} /> All
                  <span className="pill-count">{passwordEntries.length}</span>
                </button>
                {CATEGORIES.map((cat) => {
                  const count = categoryCounts[cat.key] || 0;
                  if (count === 0) return null;
                  const Icon = cat.icon;
                  return (
                    <button key={cat.key}
                      className={`category-pill ${selectedCategory === cat.key ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat.key)}
                      style={selectedCategory === cat.key ? { borderColor: cat.color, background: `${cat.color}15`, color: cat.color } : {}}>
                      <Icon size={12} style={{ color: selectedCategory === cat.key ? cat.color : undefined }} />
                      {cat.label}
                      <span className="pill-count">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="content-area">
              {activeTab === 'passwords' && (
                <PasswordList searchQuery={searchQuery} onEditEntry={handleEditEntry}
                  selectedCategory={selectedCategory} showFavoritesOnly={showFavoritesOnly} />
              )}
              {activeTab === 'cards' && (
                <CardList searchQuery={searchQuery} onEditEntry={handleEditEntry}
                  showFavoritesOnly={showFavoritesOnly} />
              )}
              {activeTab === 'notes' && (
                <NoteList searchQuery={searchQuery} onEditEntry={handleEditEntry}
                  showFavoritesOnly={showFavoritesOnly} />
              )}
            </div>
          </>
        ) : (
          <div className="content-area">
            {currentView === 'generator' && <PasswordGeneratorPage />}
            {currentView === 'profile' && <ProfilePage />}
            {currentView === 'settings' && <SettingsPage />}
          </div>
        )}
      </main>

      {renderModal()}
    </div>
  );
};

export default VaultDashboard;
