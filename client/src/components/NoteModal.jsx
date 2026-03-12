import { useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import { X, Save } from 'lucide-react';

const NoteModal = ({ onClose, initialData = null }) => {
  const { addEntry, updateEntry } = useVault();
  const existingNote = initialData?.decrypted_data || {};

  const [formData, setFormData] = useState({
    title: initialData?.service_name || '',
    content: existingNote.content || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const entryPayload = {
      service_name: formData.title,
      entry_type: 'note',
      category: 'other',
      note_data: { content: formData.content },
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

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <h3>{initialData ? 'Edit Note' : 'Add Secure Note'}</h3>
          <button onClick={onClose} className="close-btn"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title</label>
            <input type="text" placeholder="e.g. Recovery Codes" value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})} required autoFocus />
          </div>
          <div className="form-group">
            <label>Content</label>
            <textarea className="note-textarea" placeholder="Write your secure note here..."
              value={formData.content}
              onChange={e => setFormData({...formData, content: e.target.value})}
              rows={8} required />
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              <Save size={16} />
              Save Note
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NoteModal;
