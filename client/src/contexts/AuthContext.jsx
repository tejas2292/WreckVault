import React, { createContext, useState, useContext } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [masterPassword, setMasterPassword] = useState(null);
  const [authError, setAuthError] = useState(null);

  // Persistence: Restore session on reload
  React.useEffect(() => {
    const storedUser = sessionStorage.getItem('wreckvault_user');
    const storedKey = sessionStorage.getItem('wreckvault_key');
    if (storedUser && storedKey) {
      setUser(JSON.parse(storedUser));
      setMasterPassword(storedKey);
    }
  }, []);

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
    <AuthContext.Provider value={{ user, masterPassword, authError, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};
