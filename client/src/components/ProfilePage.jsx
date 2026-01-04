import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVault } from '../contexts/VaultContext';
import { useUI } from '../contexts/UIContext';
import { User, Shield, Calendar, Key, AlertTriangle, Camera } from 'lucide-react';
import api from '../api';

const ProfilePage = () => {
  const { user, updateUser, logout } = useAuth();
  const { entries } = useVault();
  const { confirm, showToast } = useUI();
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState(user.profile_image || '');
  
  // Format date
  const joinDate = user?.created_at 
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Recently';

  const handleSaveImage = async () => {
    try {
      const res = await api.put('/auth/me', { profile_image: imageUrl }, {
         headers: { 'x-user-id': user.id } 
      });
      updateUser({ profile_image: res.data.user.profile_image });
      setIsEditingImage(false);
      showToast("Profile image updated", "success");
    } catch (err) {
      showToast("Failed to update image", "error");
    }
  };

  const handleDeleteAccount = async () => {
    const isConfirmed = await confirm({
      title: 'Delete Account?',
      message: 'This action is IRREVERSIBLE. All your passwords and data will be permanently deleted. Are you absolutely sure?',
      type: 'danger'
    });

    if (isConfirmed) {
      try {
        await api.delete('/auth/me', { headers: { 'x-user-id': user.id } });
        logout();
        showToast("Account deleted successfully", "info");
      } catch (err) {
        showToast("Failed to delete account", "error");
      }
    }
  };

  return (
    <div className="profile-container" style={{ padding: '3rem', maxWidth: '900px', margin: '0 auto', animation: 'fadeIn 0.5s ease' }}>
      <header className="profile-header">
        <div className="profile-avatar-large" style={{ 
          width: '120px', height: '120px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', fontWeight: 'bold',
          overflow: 'hidden', position: 'relative', boxShadow: '0 0 30px var(--accent-glow)'
        }}>
          {user.profile_image ? (
            <img src={user.profile_image} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
             user.username[0].toUpperCase()
          )}
          
          <button 
            onClick={() => setIsEditingImage(!isEditingImage)}
            title="Change Profile Picture"
            style={{ 
              position: 'absolute', bottom: 0, width: '100%', background: 'rgba(0,0,0,0.6)', 
              border: 'none', color: 'white', cursor: 'pointer', padding: '8px', backdropFilter: 'blur(4px)'
            }}
          >
            <Camera size={20} style={{ display: 'block', margin: '0 auto' }} />
          </button>
        </div>
        
        <div>
          <h1 style={{ fontSize: '3rem', marginBottom: '0.5rem', fontWeight: '800', letterSpacing: '-1px' }}>{user.username}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Premium Vault Member</p>
          
          {isEditingImage && (
            <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
              <input 
                type="text" 
                placeholder="Image URL..." 
                value={imageUrl} 
                onChange={e => setImageUrl(e.target.value)}
                autoFocus
              />
              <button onClick={handleSaveImage} className="btn-primary" style={{ padding: '0 20px' }}>Save</button>
            </div>
          )}
        </div>
      </header>

      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '2rem' }}>
        <div className="glass-panel" style={{ padding: '2rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-primary)' }}>
            <div style={{ padding: '8px', background: 'rgba(108, 92, 231, 0.15)', borderRadius: '8px' }}><Key size={24} /></div>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Total Passwords</span>
          </div>
          <h3 style={{ fontSize: '2.5rem', fontWeight: '700' }}>{entries.length}</h3>
        </div>

        <div className="glass-panel" style={{ padding: '2rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-secondary)' }}>
            <div style={{ padding: '8px', background: 'rgba(162, 155, 254, 0.15)', borderRadius: '8px' }}><Calendar size={24} /></div>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Member Since</span>
          </div>
          <h3 style={{ fontSize: '1.5rem', fontWeight: '600' }}>{joinDate}</h3>
        </div>

         <div className="glass-panel" style={{ padding: '2rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--success)' }}>
            <div style={{ padding: '8px', background: 'rgba(46, 213, 115, 0.15)', borderRadius: '8px' }}><Shield size={24} /></div>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Vault Status</span>
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '500' }}>Encrypted & Secure</h3>
        </div>
      </div>
      
      {/* Danger Zone */}
      <div className="glass-panel" style={{ marginTop: '4rem', padding: '2rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 71, 87, 0.2)' }}>
        <h3 style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', fontSize: '1.2rem' }}>
          <AlertTriangle size={24} />
          Danger Zone
        </h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.6' }}>
          Deleting your account will permanently wipe all your encrypted data. This action cannot be undone.
        </p>
        <button 
          onClick={handleDeleteAccount} 
          style={{ 
            background: 'rgba(255, 71, 87, 0.1)', 
            color: 'var(--danger)', 
            padding: '12px 24px', 
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(255, 71, 87, 0.2)',
            fontSize: '1rem',
            fontWeight: '600'
          }}
          onMouseEnter={e => e.target.style.background = 'rgba(255, 71, 87, 0.2)'}
          onMouseLeave={e => e.target.style.background = 'rgba(255, 71, 87, 0.1)'}
        >
          Delete Account
        </button>
      </div>
    </div>
  );
};

export default ProfilePage;
