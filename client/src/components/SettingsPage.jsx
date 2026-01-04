import React, { useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVault } from '../contexts/VaultContext';
import { useUI } from '../contexts/UIContext';
import { Download, Upload, Clock, AlertTriangle, Check, Shield } from 'lucide-react';

const SettingsPage = () => {
  const { autoLockDuration, updateAutoLock } = useAuth();
  const { entries, addEntry } = useVault();
  const { confirm, showToast } = useUI();
  const fileInputRef = useRef(null);
  const [importStatus, setImportStatus] = useState('');

  // EXPORT VAULT
  const handleExport = async () => {
    const isConfirmed = await confirm({
      title: 'Export Unencrypted Data?',
      message: 'This will download an UNENCRYPTED JSON file with all your passwords. Anyone with this file can see your passwords. Are you sure?',
      type: 'warning'
    });
    
    if (!isConfirmed) return;
    
    // ... existing export logic ...
    const exportData = entries.map(e => ({
       service_name: e.service_name,
       account_username: e.account_username,
       password: e.password,
       website_url: e.website_url, // Added website_url export support
       exported_at: new Date().toISOString()
    }));
    // ...
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wreckvault-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Vault exported successfully", "success");
  };

  // IMPORT VAULT
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        if (!Array.isArray(importedData)) throw new Error("Invalid format: Root must be an array");

        let count = 0;
        setImportStatus('Importing...');
        
        for (const item of importedData) {
          if (item.service_name && item.password) {
            await addEntry({
              service_name: item.service_name,
              account_username: item.account_username || '',
              password: item.password,
              website_url: item.website_url // Added import support
            });
            count++;
          }
        }
        showToast(`Successfully imported ${count} items!`, "success");
        setImportStatus('');
      } catch (err) {
        showToast("Failed to import: " + err.message, "error");
        setImportStatus('');
      }
    };
    reader.readAsText(file);
    e.target.value = null; // Reset
  };

  return (
    <div className="profile-container" style={{ padding: '3rem', maxWidth: '800px', margin: '0 auto' }}>
      <header className="profile-header" style={{ marginBottom: '3rem' }}>
         <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={36} /> Settings
         </h1>
         <p style={{ color: 'var(--text-secondary)' }}>Manage your vault security and data.</p>
      </header>

      {/* AUTO LOCK */}
      <section className="settings-section" style={{ marginBottom: '3rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
          <Clock size={20} color="var(--accent-primary)" />
          Security: Auto-Lock
        </h3>
        <div className="card" style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            Automatically lock your vault after a period of inactivity.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {[0, 1, 5, 15, 60].map(mins => (
              <button 
                key={mins}
                onClick={() => updateAutoLock(mins)}
                className={autoLockDuration === mins ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '8px 16px' }}
              >
                {mins === 0 ? 'Never' : `${mins} min`}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* DATA MANAGEMENT */}
      <section className="settings-section">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
          <Download size={20} color="var(--success)" />
          Data Management
        </h3>
        
        <div className="card" style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
          <h4 style={{ marginBottom: '0.5rem' }}>Export Vault</h4>
          <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            Download a backup of your passwords. <span style={{ color: 'var(--danger)' }}>Warning: This file is unencrypted.</span>
          </p>
          <button onClick={handleExport} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Download size={16} /> Export JSON
          </button>
        </div>

        <div className="card" style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <h4 style={{ marginBottom: '0.5rem' }}>Import Vault</h4>
          <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            Import passwords from a JSON file. Duplicates may be created.
          </p>
          <input 
            type="file" 
            accept=".json" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleFileChange}
          />
          <button onClick={handleImportClick} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Upload size={16} /> Import JSON
          </button>
          {importStatus && <span style={{ marginLeft: '10px', color: 'var(--success)' }}>{importStatus}</span>}
        </div>
      </section>

    </div>
  );
};

export default SettingsPage;
