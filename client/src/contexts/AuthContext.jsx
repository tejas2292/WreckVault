import React, { createContext, useState, useContext } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [masterPassword, setMasterPassword] = useState(null);
  const [authError, setAuthError] = useState(null);

  const login = async (username, password) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/login', { username, password });
      setUser(response.data.user);
      setMasterPassword(password); // Keep in memory for encryption
      return true;
    } catch (err) {
      setAuthError(err.response?.data?.error || 'Login failed');
      return false;
    }
  };

  const register = async (username, password) => {
    setAuthError(null);
    try {
      await api.post('/auth/register', { username, password });
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
  };

  return (
    <AuthContext.Provider value={{ user, masterPassword, authError, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
