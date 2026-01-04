import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../api';
import { useAuth } from './AuthContext';
import { encrypt, decrypt } from '../utils/encryption';

const VaultContext = createContext(null);

export const useVault = () => useContext(VaultContext);

export const VaultProvider = ({ children }) => {
  const { user, masterPassword } = useAuth();
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch and Decrypt Entries
  useEffect(() => {
    if (user && masterPassword) {
      fetchEntries();
    } else {
      setEntries([]);
    }
  }, [user, masterPassword]);

  const fetchEntries = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // Pass User ID in header for simple auth check
      const response = await api.get('/vault', { 
         headers: { 'x-user-id': user.id } 
      });
      
      const decryptedEntries = response.data.map(entry => {
        const decryptedPassword = decrypt(entry.encrypted_blob, masterPassword);
        return {
          ...entry,
          password: decryptedPassword || '*** DECRYPTION ERROR ***'
        };
      });

      setEntries(decryptedEntries);
    } catch (err) {
      console.error(err);
      setError("Failed to load vault");
    } finally {
      setIsLoading(false);
    }
  };

  const addEntry = async (entryData) => {
    // encrypt password
    const cipher = encrypt(entryData.password, masterPassword);
    
    try {
      const response = await api.post('/vault', {
        service_name: entryData.service_name,
        account_username: entryData.account_username,
        encrypted_blob: cipher,
        iv: 'embedded-in-blob' // CryptoJS embeds IV
      }, { 
         headers: { 'x-user-id': user.id } 
      });

      const newServerEntry = response.data;
      // Add to local state
      const newLocalEntry = {
        ...newServerEntry,
        password: entryData.password
      };
      
      setEntries([newLocalEntry, ...entries]);
      return true;
    } catch (err) {
      console.error(err);
      setError("Failed to save entry");
      return false;
    }
  };

  const deleteEntry = async (id) => {
    try {
      await api.delete(`/vault/${id}`, { 
         headers: { 'x-user-id': user.id } 
      });
      setEntries(entries.filter(e => e.id !== id));
      return true;
    } catch (err) {
      console.error(err);
      setError("Failed to delete entry");
      return false;
    }
  };

  return (
    <VaultContext.Provider value={{ entries, isLoading, error, addEntry, deleteEntry, refresh: fetchEntries }}>
      {children}
    </VaultContext.Provider>
  );
};
