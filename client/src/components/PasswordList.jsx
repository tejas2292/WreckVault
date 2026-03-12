import { useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import { useUI } from '../contexts/UIContext';
import { Eye, EyeOff, Copy, Pen, Trash2, Star } from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';
import { getCategoryByKey } from '../constants/categories';

const PasswordCard = ({ entry, onEdit }) => {
  const { deleteEntry, toggleFavorite } = useVault();
  const { confirm, showToast } = useUI();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(entry.password);
    if (success) {
      setCopied(true);
      showToast("Password copied to clipboard!", "success");
      setTimeout(() => setCopied(false), 2000);
    } else {
      showToast("Failed to copy. Try manual copy.", "error");
    }
  };

  const handleDelete = async () => {
    const isConfirmed = await confirm({
      title: 'Delete Password',
      message: `Are you sure you want to delete the password for "${entry.service_name}"? This cannot be undone.`,
      type: 'danger'
    });
    if (isConfirmed) {
      deleteEntry(entry.id);
      showToast("Password deleted successfully", "success");
    }
  };

  const getLogoUrl = (name) => {
    try {
      let domain = '';
      if (entry.website_url) {
        domain = entry.website_url.toLowerCase().trim().replace(/^https?:\/\//, '');
      } else {
        domain = name.toLowerCase().trim();
        if (domain.includes(' ')) domain = domain.split(' ')[0];
        if (!domain.includes('.')) domain += '.com';
      }
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    } catch {
      return null;
    }
  };

  const logoUrl = getLogoUrl(entry.service_name);
  const category = getCategoryByKey(entry.category);
  const CategoryIcon = category.icon;

  return (
    <div className="password-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="category-badge" style={{ background: `${category.color}18`, color: category.color, borderColor: `${category.color}30` }}>
          <CategoryIcon size={10} />
          {category.label}
        </div>
        <button className="fav-btn" onClick={() => toggleFavorite(entry.id)}
          style={{ color: entry.is_favorite ? '#ffa502' : 'var(--text-muted)' }}>
          <Star size={16} fill={entry.is_favorite ? '#ffa502' : 'none'} />
        </button>
      </div>
      <div className="card-header">
        <div className="service-icon" style={{ overflow: 'hidden', background: imgError ? 'var(--accent-primary)' : 'transparent' }}>
          {!imgError ? (
            <img src={logoUrl} alt={entry.service_name}
              onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            entry.service_name[0].toUpperCase()
          )}
        </div>
        <div className="service-info">
          <h3>{entry.service_name}</h3>
          <p className="username">{entry.account_username}</p>
        </div>
      </div>

      <div className="card-body">
        <div className="password-field">
          <input type="text" value={revealed ? entry.password : '••••••••••••'} readOnly />
          <button className="icon-btn" onClick={() => setRevealed(!revealed)}>
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div className="card-actions">
        <button className="action-btn" onClick={handleCopy}>
          <Copy size={14} />
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button className="action-btn" onClick={() => onEdit(entry)}>
          <Pen size={14} />
          Edit
        </button>
        <button className="action-btn delete" onClick={handleDelete}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

const PasswordList = ({ searchQuery, onEditEntry, selectedCategory, showFavoritesOnly }) => {
  const { entries, isLoading, error } = useVault();

  if (isLoading && entries.length === 0) return <div className="loading">Loading vault...</div>;
  if (error) return <div className="error">{error}</div>;

  const filteredEntries = entries.filter(entry => {
    if (entry.entry_type && entry.entry_type !== 'password') return false;
    if (showFavoritesOnly && !entry.is_favorite) return false;
    const matchesSearch =
      entry.service_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (entry.account_username || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || selectedCategory === 'all' || entry.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (filteredEntries.length === 0) {
    return <div className="empty-state"><p>No passwords found.</p></div>;
  }

  return (
    <div className="password-grid">
      {filteredEntries.map(entry => (
        <PasswordCard key={entry.id} entry={entry} onEdit={onEditEntry} />
      ))}
    </div>
  );
};

export default PasswordList;
