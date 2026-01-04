import React, { useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import { X, Save } from 'lucide-react';

const PasswordModal = ({ onClose }) => {
  const { addEntry } = useVault();
  const [formData, setFormData] = useState({
    service_name: '',
    account_username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const success = await addEntry(formData);
    setLoading(false);
    if (success) onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <h3>Add New Password</h3>
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
            <input
              type="password"
              placeholder="Secret Password"
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})}
              required
            />
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
