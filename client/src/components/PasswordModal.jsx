import React, { useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import { X, Save, Eye, EyeOff } from 'lucide-react';

const PasswordModal = ({ onClose, initialData = null }) => {
  const { addEntry, updateEntry, entries } = useVault();
  const [formData, setFormData] = useState({
    service_name: initialData?.service_name || '',
    account_username: initialData?.account_username || '',
    password: initialData?.password || '',
    website_url: initialData?.website_url || ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Autocomplete State
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleUrlChange = (e) => {
    const val = e.target.value;
    setFormData({...formData, website_url: val});
    
    if (val.length > 0) {
      // Get unique existing URLs matches
      const uniqueUrls = [...new Set(entries.map(ent => ent.website_url).filter(u => u && u.toLowerCase().includes(val.toLowerCase())))];
      setSuggestions(uniqueUrls.slice(0, 5)); // Limit to 5
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (url) => {
    setFormData({...formData, website_url: url});
    setShowSuggestions(false);
  };

  // ... (rest of component handles submit correctly using formData) ...
  
  const handleSubmit = async (e) => {
     // ...
     e.preventDefault();
     setLoading(true);
     let success;
    
     if (initialData) {
       success = await updateEntry(initialData.id, formData);
     } else {
       success = await addEntry(formData);
     }
 
     setLoading(false);
     if (success) onClose();
   };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <h3>{initialData ? 'Edit Password' : 'Add New Password'}</h3>
          <button onClick={onClose} className="close-btn"><X size={24} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Service Name</label>
            <input
              type="text"
              placeholder="e.g. Netflix"
              value={formData.service_name}
              onChange={e => setFormData({...formData, service_name: e.target.value})}
              required
              autoFocus
            />
          </div>
           <div className="form-group" style={{ position: 'relative' }}>
            <label>Website URL (Optional)</label>
            <input
              type="text"
              placeholder="e.g. netflix.com"
              value={formData.website_url}
              onChange={handleUrlChange}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onFocus={() => formData.website_url && handleUrlChange({ target: { value: formData.website_url } })}
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: '0 0 4px 4px', zIndex: 10, maxHeight: '150px', overflowY: 'auto',
                listStyle: 'none', padding: 0, margin: 0
              }}>
                {suggestions.map((url, idx) => (
                  <li 
                    key={idx}
                    onClick={() => selectSuggestion(url)}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)',
                      fontSize: '0.9rem', color: 'var(--text-secondary)'
                    }}
                    onMouseEnter={(e) => { e.target.style.background = 'var(--bg-hover)'; e.target.style.color = 'white'; }}
                    onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = 'var(--text-secondary)'; }}
                  >
                    {url}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="form-group">
            <label>Username / Email</label>
            <input
              type="text"
              placeholder="user@example.com"
              value={formData.account_username}
              onChange={e => setFormData({...formData, account_username: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Secret Password"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                required
                style={{ paddingRight: '44px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  color: 'var(--text-secondary)',
                  padding: 0
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              <Save size={18} />
              Save Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PasswordModal;
