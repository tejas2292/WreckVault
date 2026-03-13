import { useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import { X, Save, Eye, EyeOff, ChevronDown } from 'lucide-react';
import CATEGORIES, { getCategoryByKey } from '../constants/categories';
import PasswordStrength from './PasswordStrength';

const PasswordModal = ({ onClose, initialData = null }) => {
  const { addEntry, updateEntry, entries } = useVault();
  const [formData, setFormData] = useState({
    service_name: initialData?.service_name || '',
    account_username: initialData?.account_username || '',
    password: initialData?.password || '',
    website_url: initialData?.website_url || '',
    category: initialData?.category || 'other'
  });
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleUrlChange = (e) => {
    const val = e.target.value;
    setFormData({...formData, website_url: val});
    if (val.length > 0) {
      const uniqueUrls = [...new Set(entries.map(ent => ent.website_url).filter(u => u && u.toLowerCase().includes(val.toLowerCase())))];
      setSuggestions(uniqueUrls.slice(0, 5));
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (url) => {
    setFormData({...formData, website_url: url});
    setShowSuggestions(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    let success;
    if (initialData) {
      success = await updateEntry(initialData.id, { ...formData, entry_type: 'password' });
    } else {
      success = await addEntry({ ...formData, entry_type: 'password' });
    }
    setLoading(false);
    if (success) onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <h3>{initialData ? 'Edit Password' : 'Add New Password'}</h3>
          <button onClick={onClose} className="close-btn"><X size={20} /></button>
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
            <label>Category</label>
            <button type="button" className="category-select-btn" onClick={() => setCategoryOpen(!categoryOpen)}>
              {(() => {
                const cat = getCategoryByKey(formData.category);
                const Icon = cat.icon;
                return (
                  <>
                    <span className="category-select-preview" style={{ color: cat.color }}>
                      <Icon size={16} />
                      {cat.label}
                    </span>
                    <ChevronDown size={16} style={{ transform: categoryOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </>
                );
              })()}
            </button>
            {categoryOpen && (
              <div className="category-dropdown">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = formData.category === cat.key;
                  return (
                    <div key={cat.key} className={`category-dropdown-item ${isActive ? 'active' : ''}`}
                      onClick={() => { setFormData({...formData, category: cat.key}); setCategoryOpen(false); }}>
                      <Icon size={16} style={{ color: cat.color }} />
                      <span>{cat.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
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
              <ul className="autocomplete-dropdown">
                {suggestions.map((url, idx) => (
                  <li key={idx} onClick={() => selectSuggestion(url)}>{url}</li>
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
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', color: 'var(--text-secondary)', padding: 0 }}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <PasswordStrength password={formData.password} />
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              <Save size={16} />
              Save Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PasswordModal;
