import { createContext, useState, useContext, useEffect, useCallback } from 'react';
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

  const decryptEntry = useCallback((entry) => {
    const decrypted = decrypt(entry.encrypted_blob, masterPassword);
    const entryType = entry.entry_type || 'password';

    if (entryType === 'card' || entryType === 'note') {
      try {
        const parsed = JSON.parse(decrypted);
        return { ...entry, decrypted_data: parsed, password: decrypted };
      } catch {
        return { ...entry, decrypted_data: null, password: '*** DECRYPTION ERROR ***' };
      }
    }

    return { ...entry, password: decrypted || '*** DECRYPTION ERROR ***' };
  }, [masterPassword]);

  const fetchEntries = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const response = await api.get('/vault', {
        headers: { 'x-user-id': user.id }
      });
      const decryptedEntries = response.data.map(decryptEntry);
      setEntries(decryptedEntries);
    } catch (err) {
      console.error(err);
      setError("Failed to load vault");
    } finally {
      setIsLoading(false);
    }
  }, [user, masterPassword, decryptEntry]);

  useEffect(() => {
    if (user && masterPassword) {
      fetchEntries();
    } else {
      setEntries([]);
    }
  }, [user, masterPassword, fetchEntries]);

  const addEntry = async (entryData) => {
    const entryType = entryData.entry_type || 'password';
    let dataToEncrypt;

    if (entryType === 'card') {
      dataToEncrypt = JSON.stringify(entryData.card_data);
    } else if (entryType === 'note') {
      dataToEncrypt = JSON.stringify(entryData.note_data);
    } else {
      dataToEncrypt = entryData.password;
    }

    const cipher = encrypt(dataToEncrypt, masterPassword);

    try {
      const response = await api.post('/vault', {
        service_name: entryData.service_name,
        account_username: entryData.account_username || '',
        encrypted_blob: cipher,
        iv: 'embedded-in-blob',
        website_url: entryData.website_url || '',
        category: entryData.category || 'other',
        entry_type: entryType
      }, {
        headers: { 'x-user-id': user.id }
      });

      const newServerEntry = response.data;
      const newLocalEntry = decryptEntry(newServerEntry);

      setEntries([newLocalEntry, ...entries]);
      return true;
    } catch (err) {
      console.error(err);
      setError("Failed to save entry");
      return false;
    }
  };

  const updateEntry = async (id, entryData) => {
    const entryType = entryData.entry_type || 'password';
    let dataToEncrypt;

    if (entryType === 'card') {
      dataToEncrypt = JSON.stringify(entryData.card_data);
    } else if (entryType === 'note') {
      dataToEncrypt = JSON.stringify(entryData.note_data);
    } else {
      dataToEncrypt = entryData.password;
    }

    const cipher = encrypt(dataToEncrypt, masterPassword);

    try {
      const response = await api.put(`/vault/${id}`, {
        service_name: entryData.service_name,
        account_username: entryData.account_username || '',
        encrypted_blob: cipher,
        iv: 'embedded-in-blob',
        website_url: entryData.website_url || '',
        category: entryData.category || 'other',
        entry_type: entryType
      }, {
        headers: { 'x-user-id': user.id }
      });

      const updatedServerEntry = response.data;
      const updatedLocalEntry = decryptEntry(updatedServerEntry);

      setEntries(entries.map(e => e.id === id ? updatedLocalEntry : e));
      return true;
    } catch (err) {
      console.error(err);
      setError("Failed to update entry");
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

  const toggleFavorite = async (id) => {
    try {
      const response = await api.patch(`/vault/${id}/favorite`, {}, {
        headers: { 'x-user-id': user.id }
      });
      const updated = response.data;
      setEntries(entries.map(e => e.id === id ? { ...e, is_favorite: updated.is_favorite } : e));
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  return (
    <VaultContext.Provider value={{
      entries, isLoading, error,
      addEntry, updateEntry, deleteEntry, toggleFavorite,
      refresh: fetchEntries
    }}>
      {children}
    </VaultContext.Provider>
  );
};
