import React, { useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import { useUI } from '../contexts/UIContext';
import { Eye, EyeOff, Copy, Pen, Trash2 } from 'lucide-react';

const PasswordCard = ({ entry, onEdit }) => {
  const { deleteEntry } = useVault();
  const { confirm, showToast } = useUI();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(entry.password);
    setCopied(true);
    showToast("Password copied to clipboard!", "success");
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleEdit = () => {
    onEdit(entry);
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

  // Smart Logo Logic
  const getLogoUrl = (name) => {
    try {
      let domain = '';
      
      if (entry.website_url) {
         domain = entry.website_url.toLowerCase().trim();
         // Strip protocol if present for cleaner processing, though Google API handles it
         domain = domain.replace(/^https?:\/\//, '');
      } else {
         // Fallback Heuristic
         domain = name.toLowerCase().trim();
         if (domain.includes(' ')) domain = domain.split(' ')[0];
         if (!domain.includes('.')) domain += '.com';
      }
      
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    } catch (e) {
      return null;
    }
  };

  const logoUrl = getLogoUrl(entry.service_name);

  return (
    <div className="password-card">
      <div className="card-header">
        <div className="service-icon" style={{ overflow: 'hidden', background: imgError ? 'var(--accent-primary)' : 'transparent' }}>
          {!imgError ? (
            <img 
              src={logoUrl} 
              alt={entry.service_name}
              onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
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
          <input 
            type="text" 
            value={revealed ? entry.password : '••••••••••••'} 
            readOnly 
          />
          <button className="icon-btn" onClick={() => setRevealed(!revealed)}>
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div className="card-actions">
        <button className="action-btn" onClick={handleCopy}>
          <Copy size={16} />
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button className="action-btn" onClick={handleEdit}>
          <Pen size={16} />
          Edit
        </button>
        <button className="action-btn delete" onClick={handleDelete}>
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

const PasswordList = ({ searchQuery, onEditEntry }) => {
  const { entries, isLoading, error } = useVault();

  if (isLoading && entries.length === 0) return <div className="loading">Loading vault...</div>;
  if (error) return <div className="error">{error}</div>;

  const filteredEntries = entries.filter(entry => 
    entry.service_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.account_username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (filteredEntries.length === 0) {
    return (
      <div className="empty-state">
        <p>No passwords found.</p>
      </div>
    );
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
