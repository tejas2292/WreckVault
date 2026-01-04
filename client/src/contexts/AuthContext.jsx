import React, { createContext, useState, useContext } from 'react';
import api from '../api';
import { useUI } from './UIContext';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const { showToast } = useUI();
  const [user, setUser] = useState(null);
  const [masterPassword, setMasterPassword] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [autoLockDuration, setAutoLockDuration] = useState(parseInt(localStorage.getItem('wreckvault_autolock') || '0')); // 0 = disabled

  // Persistence: Restore session on reload
  React.useEffect(() => {
    const storedUser = sessionStorage.getItem('wreckvault_user');
    const storedKey = sessionStorage.getItem('wreckvault_key');
    if (storedUser && storedKey) {
      setUser(JSON.parse(storedUser));
      setMasterPassword(storedKey);
    }
  }, []);

  // Auto-Lock Logic
  React.useEffect(() => {
    if (!user || autoLockDuration === 0) return;

    let timer;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        console.log("Auto-locking vault due to inactivity...");
        logout();
        alert("Vault locked due to inactivity.");
      }, autoLockDuration * 60 * 1000);
    };

    // Events to track activity
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);

    // Initial start
    resetTimer();

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
    };
  }, [user, autoLockDuration]);

  const updateAutoLock = (minutes) => {
    setAutoLockDuration(minutes);
    localStorage.setItem('wreckvault_autolock', minutes.toString());
  };

  const login = async (username, password) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/login', { username, password });
      const userData = response.data.user;
      
      setUser(userData);
      setMasterPassword(password);
      
      // Save to session storage (clears when tab closes)
      sessionStorage.setItem('wreckvault_user', JSON.stringify(userData));
      sessionStorage.setItem('wreckvault_key', password);
      
      return true;
    } catch (err) {
      setAuthError(err.response?.data?.error || 'Login failed');
      return false;
    }
  };

  const register = async (username, password) => {
    // ... existing register ...
    setAuthError(null);
    try {
      const response = await api.post('/auth/register', { username, password });
      // Auto login after register
      await login(username, password);
      return true;
    } catch (err) {
      setAuthError(err.response?.data?.error || 'Registration failed');
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setMasterPassword(null);
    sessionStorage.removeItem('wreckvault_user');
    sessionStorage.removeItem('wreckvault_key');
  };

  const updateUser = (updates) => {
    const newUser = { ...user, ...updates };
    setUser(newUser);
    sessionStorage.setItem('wreckvault_user', JSON.stringify(newUser));
  };

  return (
    <AuthContext.Provider value={{ user, masterPassword, authError, login, register, logout, updateUser, autoLockDuration, updateAutoLock }}>
      {children}
    </AuthContext.Provider>
  );
};
