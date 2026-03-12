import { useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import { X, Save } from 'lucide-react';

const CARD_TYPES = [
  { key: 'visa', label: 'Visa', color: '#1a1f71' },
  { key: 'mastercard', label: 'Mastercard', color: '#eb001b' },
  { key: 'amex', label: 'Amex', color: '#006fcf' },
  { key: 'discover', label: 'Discover', color: '#ff6000' },
  { key: 'other', label: 'Other', color: '#636e72' },
];

const detectCardType = (number) => {
  const n = number.replace(/\s/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^6(?:011|5)/.test(n)) return 'discover';
  return 'other';
};

const formatCardNumber = (val) => {
  const digits = val.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
};

const CardModal = ({ onClose, initialData = null }) => {
  const { addEntry, updateEntry } = useVault();
  const existingCard = initialData?.decrypted_data || {};

  const [formData, setFormData] = useState({
    card_label: initialData?.service_name || '',
    cardholder_name: existingCard.cardholder_name || '',
    card_number: existingCard.card_number || '',
    expiry_month: existingCard.expiry_month || '',
    expiry_year: existingCard.expiry_year || '',
    cvv: existingCard.cvv || '',
    card_type: existingCard.card_type || 'other',
  });
  const [loading, setLoading] = useState(false);

  const handleCardNumberChange = (e) => {
    const formatted = formatCardNumber(e.target.value);
    const detected = detectCardType(formatted);
    setFormData({ ...formData, card_number: formatted, card_type: detected });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const entryPayload = {
      service_name: formData.card_label,
      account_username: formData.cardholder_name,
      entry_type: 'card',
      category: 'finance',
      card_data: {
        cardholder_name: formData.cardholder_name,
        card_number: formData.card_number,
        expiry_month: formData.expiry_month,
        expiry_year: formData.expiry_year,
        cvv: formData.cvv,
        card_type: formData.card_type,
      }
    };

    let success;
    if (initialData) {
      success = await updateEntry(initialData.id, entryPayload);
    } else {
      success = await addEntry(entryPayload);
    }

    setLoading(false);
    if (success) onClose();
  };

  const activeType = CARD_TYPES.find(t => t.key === formData.card_type) || CARD_TYPES[4];

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <h3>{initialData ? 'Edit Card' : 'Add New Card'}</h3>
          <button onClick={onClose} className="close-btn"><X size={20} /></button>
        </div>

        {/* Card Preview */}
        <div className="credit-card-preview" style={{ background: `linear-gradient(135deg, ${activeType.color}, ${activeType.color}99)` }}>
          <div className="cc-chip" />
          <div className="cc-number">{formData.card_number || '•••• •••• •••• ••••'}</div>
          <div className="cc-bottom">
            <div>
              <div className="cc-label">Card Holder</div>
              <div className="cc-value">{formData.cardholder_name || 'YOUR NAME'}</div>
            </div>
            <div>
              <div className="cc-label">Expires</div>
              <div className="cc-value">{formData.expiry_month || 'MM'}/{formData.expiry_year || 'YY'}</div>
            </div>
            <div className="cc-brand">{activeType.label}</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Card Label</label>
            <input type="text" placeholder="e.g. Personal Visa" value={formData.card_label}
              onChange={e => setFormData({...formData, card_label: e.target.value})} required autoFocus />
          </div>
          <div className="form-group">
            <label>Cardholder Name</label>
            <input type="text" placeholder="John Doe" value={formData.cardholder_name}
              onChange={e => setFormData({...formData, cardholder_name: e.target.value})} required />
          </div>
          <div className="form-group">
            <label>Card Number</label>
            <input type="text" placeholder="4111 1111 1111 1111" value={formData.card_number}
              onChange={handleCardNumberChange} maxLength={19} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label>Month</label>
              <input type="text" placeholder="MM" maxLength={2} value={formData.expiry_month}
                onChange={e => setFormData({...formData, expiry_month: e.target.value.replace(/\D/g, '').slice(0, 2)})} required />
            </div>
            <div className="form-group">
              <label>Year</label>
              <input type="text" placeholder="YY" maxLength={2} value={formData.expiry_year}
                onChange={e => setFormData({...formData, expiry_year: e.target.value.replace(/\D/g, '').slice(0, 2)})} required />
            </div>
            <div className="form-group">
              <label>CVV</label>
              <input type="password" placeholder="•••" maxLength={4} value={formData.cvv}
                onChange={e => setFormData({...formData, cvv: e.target.value.replace(/\D/g, '').slice(0, 4)})} required />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              <Save size={16} />
              Save Card
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CardModal;
