import React, { useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import { X, Save, Eye, EyeOff } from 'lucide-react';

const PasswordModal = ({ onClose, initialData = null }) => {
  const { addEntry, updateEntry } = useVault();
  const [formData, setFormData] = useState({
    service_name: initialData?.service_name || '',
    account_username: initialData?.account_username || '',
    password: initialData?.password || ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
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
