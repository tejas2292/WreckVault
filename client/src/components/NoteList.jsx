import { useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import { useUI } from '../contexts/UIContext';
import { Eye, EyeOff, Copy, Pen, Trash2, Star, FileText } from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';

const NoteCard = ({ entry, onEdit }) => {
  const { deleteEntry, toggleFavorite } = useVault();
  const { confirm, showToast } = useUI();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const note = entry.decrypted_data || {};
  const preview = note.content
    ? (note.content.length > 80 ? note.content.substring(0, 80) + '...' : note.content)
    : '';

  const handleCopy = async () => {
    const success = await copyToClipboard(note.content || '');
    if (success) {
      setCopied(true);
      showToast("Note copied to clipboard!", "success");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = async () => {
    const isConfirmed = await confirm({
      title: 'Delete Note',
      message: `Delete "${entry.service_name}"? This cannot be undone.`,
      type: 'danger'
    });
    if (isConfirmed) {
      deleteEntry(entry.id);
      showToast("Note deleted", "success");
    }
  };

  return (
    <div className="password-card note-card">
      <div className="note-card-header">
        <div className="note-icon-wrap">
          <FileText size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <h3>{entry.service_name}</h3>
        </div>
        <button className="fav-btn" onClick={() => toggleFavorite(entry.id)}
          style={{ color: entry.is_favorite ? '#ffa502' : 'var(--text-muted)' }}>
          <Star size={16} fill={entry.is_favorite ? '#ffa502' : 'none'} />
        </button>
      </div>

      <div className="note-content-area" onClick={() => setRevealed(!revealed)}>
        {revealed ? (
          <pre className="note-full-content">{note.content}</pre>
        ) : (
          <p className="note-preview">{preview || 'Empty note'}</p>
        )}
      </div>

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
  );
};

const NoteList = ({ searchQuery, onEditEntry, showFavoritesOnly }) => {
  const { entries, isLoading, error } = useVault();

  if (isLoading && entries.length === 0) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  const filtered = entries.filter(e => {
    if (e.entry_type !== 'note') return false;
    if (showFavoritesOnly && !e.is_favorite) return false;
    return e.service_name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (filtered.length === 0) {
    return <div className="empty-state"><p>No notes found.</p></div>;
  }

  return (
    <div className="password-grid">
      {filtered.map(entry => (
        <NoteCard key={entry.id} entry={entry} onEdit={onEditEntry} />
      ))}
    </div>
  );
};

export default NoteList;
