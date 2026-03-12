import { useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import { useUI } from '../contexts/UIContext';
import { Eye, EyeOff, Copy, Pen, Trash2, Star } from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';

const CARD_COLORS = {
  visa: '#1a1f71',
  mastercard: '#eb001b',
  amex: '#006fcf',
  discover: '#ff6000',
  other: '#636e72',
};

const CARD_LABELS = {
  visa: 'VISA',
  mastercard: 'MC',
  amex: 'AMEX',
  discover: 'DISC',
  other: 'CARD',
};

const CardCard = ({ entry, onEdit }) => {
  const { deleteEntry, toggleFavorite } = useVault();
  const { confirm, showToast } = useUI();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const card = entry.decrypted_data || {};
  const cardType = card.card_type || 'other';
  const bgColor = CARD_COLORS[cardType] || CARD_COLORS.other;
  const brandLabel = CARD_LABELS[cardType] || 'CARD';

  const maskedNumber = card.card_number
    ? '•••• •••• •••• ' + card.card_number.replace(/\s/g, '').slice(-4)
    : '•••• •••• •••• ••••';

  const handleCopy = async () => {
    const num = card.card_number?.replace(/\s/g, '') || '';
    const success = await copyToClipboard(num);
    if (success) {
      setCopied(true);
      showToast("Card number copied!", "success");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = async () => {
    const isConfirmed = await confirm({
      title: 'Delete Card',
      message: `Delete "${entry.service_name}"? This cannot be undone.`,
      type: 'danger'
    });
    if (isConfirmed) {
      deleteEntry(entry.id);
      showToast("Card deleted", "success");
    }
  };

  return (
    <div className="vault-card card-entry">
      <div className="credit-card-display" style={{ background: `linear-gradient(135deg, ${bgColor}, ${bgColor}88)` }}>
        <div className="cc-display-top">
          <div className="cc-chip-small" />
          <button className="fav-btn" onClick={() => toggleFavorite(entry.id)}
            style={{ color: entry.is_favorite ? '#ffa502' : 'rgba(255,255,255,0.4)' }}>
            <Star size={16} fill={entry.is_favorite ? '#ffa502' : 'none'} />
          </button>
        </div>
        <div className="cc-display-number" onClick={() => setRevealed(!revealed)}>
          {revealed ? card.card_number : maskedNumber}
        </div>
        <div className="cc-display-bottom">
          <div>
            <div className="cc-display-label">Card Holder</div>
            <div className="cc-display-value">{card.cardholder_name || '—'}</div>
          </div>
          <div>
            <div className="cc-display-label">Expires</div>
            <div className="cc-display-value">{card.expiry_month}/{card.expiry_year}</div>
          </div>
          <div className="cc-display-brand">{brandLabel}</div>
        </div>
      </div>
      <div className="card-entry-footer">
        <h4>{entry.service_name}</h4>
        <div className="card-actions">
          <button className="action-btn" onClick={() => setRevealed(!revealed)}>
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
            {revealed ? 'Hide' : 'Show'}
          </button>
          <button className="action-btn" onClick={handleCopy}>
            <Copy size={14} />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button className="action-btn" onClick={() => onEdit(entry)}>
            <Pen size={14} />
          </button>
          <button className="action-btn delete" onClick={handleDelete}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

const CardList = ({ searchQuery, onEditEntry, showFavoritesOnly }) => {
  const { entries, isLoading, error } = useVault();

  if (isLoading && entries.length === 0) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  const filtered = entries.filter(e => {
    if (e.entry_type !== 'card') return false;
    if (showFavoritesOnly && !e.is_favorite) return false;
    return e.service_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           (e.account_username || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (filtered.length === 0) {
    return <div className="empty-state"><p>No cards found.</p></div>;
  }

  return (
    <div className="password-grid">
      {filtered.map(entry => (
        <CardCard key={entry.id} entry={entry} onEdit={onEditEntry} />
      ))}
    </div>
  );
};

export default CardList;
