import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useVault } from '../contexts/VaultContext';
import { User, Shield, Calendar, Key, AlertTriangle } from 'lucide-react';

const ProfilePage = () => {
  const { user } = useAuth();
  const { entries } = useVault();
  
  // Format date
  const joinDate = user?.created_at 
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Recently';

  const securityScore = Math.min(100, entries.length * 10); // Dummy score logic

  return (
    <div className="profile-container" style={{ padding: '3rem', maxWidth: '800px', margin: '0 auto' }}>
      <header className="profile-header" style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '3rem' }}>
        <div className="profile-avatar-large" style={{ 
          width: '100px', height: '100px', borderRadius: '50%', background: 'var(--accent-secondary)', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', fontWeight: 'bold' 
        }}>
          {user.username[0].toUpperCase()}
        </div>
        <div>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{user.username}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Standard User</p>
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
        <button className="btn-danger" style={{ 
          background: 'rgba(255, 71, 87, 0.1)', color: 'var(--danger)', padding: '10px 20px', borderRadius: 'var(--radius-sm)'
        }}>Delete Account</button>
      </div>
    </div>
  );
};

export default ProfilePage;
