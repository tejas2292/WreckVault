import CryptoJS from 'crypto-js';

// Derived key configuration could be improved, but for this prototype:
// We use the raw password as the passphrase for CryptoJS's default AES implementation,
// which handles salt/iv derivation internally (OpenSSL compatible).

export const encrypt = (text, secret) => {
  if (!text || !secret) return null;
  return CryptoJS.AES.encrypt(text, secret).toString();
};

export const decrypt = (ciphertext, secret) => {
  if (!ciphertext || !secret) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, secret);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    return originalText || null; // Return null if decryption fails (empty string usually means wrong key)
  } catch (e) {
    console.error("Decryption failed", e);
    return null;
  }
};
