import React from 'react';
import { useVault } from '../contexts/VaultContext';
import { Copy, Trash2, Eye, EyeOff } from 'lucide-react';

const PasswordCard = ({ entry }) => {
  const { deleteEntry } = useVault();
  const [revealed, setRevealed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(entry.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this password?")) {
      deleteEntry(entry.id);
    }
  };

  return (
    <div className="password-card">
      <div className="card-header">
        <div className="service-icon">{entry.service_name[0].toUpperCase()}</div>
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
        <button className="action-btn delete" onClick={handleDelete}>
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

const PasswordList = ({ searchQuery }) => {
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
        <PasswordCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
};

export default PasswordList;
