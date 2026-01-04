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
    <div className="profile-container" style={{ padding: '3rem', maxWidth: '800px', margin: '0 auto' }}>
      <header className="profile-header" style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '3rem' }}>
        <div className="profile-avatar-large" style={{ 
          width: '100px', height: '100px', borderRadius: '50%', background: 'var(--accent-secondary)', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', fontWeight: 'bold',
          overflow: 'hidden', position: 'relative'
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
              position: 'absolute', bottom: 0, width: '100%', background: 'rgba(0,0,0,0.5)', 
              border: 'none', color: 'white', cursor: 'pointer', padding: '5px' 
            }}
          >
            <Camera size={16} style={{ display: 'block', margin: '0 auto' }} />
          </button>
        </div>
        
        <div>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{user.username}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Standard User</p>
          
          {isEditingImage && (
            <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
              <input 
                type="text" 
                placeholder="Image URL..." 
                value={imageUrl} 
                onChange={e => setImageUrl(e.target.value)}
                style={{ padding: '5px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'white' }}
              />
              <button onClick={handleSaveImage} className="btn-primary" style={{ padding: '5px 10px', fontSize: '0.8rem' }}>Save</button>
            </div>
          )}
        </div>
      </header>

      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        <div className="stat-card" style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--accent-primary)' }}>
            <Key size={20} />
            <span>Total Passwords</span>
          </div>
          <h3 style={{ fontSize: '2rem' }}>{entries.length}</h3>
        </div>

        <div className="stat-card" style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--accent-secondary)' }}>
            <Calendar size={20} />
            <span>Member Since</span>
          </div>
          <h3 style={{ fontSize: '1.2rem' }}>{joinDate}</h3>
        </div>

         <div className="stat-card" style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--success)' }}>
            <Shield size={20} />
            <span>Vault Status</span>
          </div>
          <h3 style={{ fontSize: '1.2rem' }}>Encrypted & Secure</h3>
        </div>
      </div>
      
      {/* Danger Zone */}
      <div style={{ marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid var(--border-color)' }}>
        <h3 style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <AlertTriangle size={20} />
          Danger Zone
        </h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>Deleting your account will permanently wipe all your encrypted data.</p>
        <button className="btn-danger" onClick={handleDeleteAccount} style={{ 
          background: 'rgba(255, 71, 87, 0.1)', color: 'var(--danger)', padding: '10px 20px', borderRadius: 'var(--radius-sm)'
        }}>Delete Account</button>
      </div>
    </div>
  );
};

export default ProfilePage;
