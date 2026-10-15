// Fake v1 rows for tests. Not real data.
import CryptoJS from 'crypto-js';

export const V1_PASSWORD = 'correct horse battery staple';
const enc = (text, pw = V1_PASSWORD) => CryptoJS.AES.encrypt(text, pw).toString();

export function makeV1Rows() {
  return [
    {
      id: 11, serviceName: 'GitHub', accountUsername: 'alice', encryptedBlob: enc('hunter2'),
      websiteUrl: 'https://github.example.com', category: 'development', entryType: 'password',
      isFavorite: true, createdAt: '2025-01-02T03:04:05.000Z', updatedAt: '2025-02-03T04:05:06.000Z',
    },
    {
      id: 12, serviceName: 'Router', accountUsername: '', encryptedBlob: enc('pa,ss"word'),
      websiteUrl: '', category: 'other', entryType: null, isFavorite: false,
      createdAt: '2025-01-03T00:00:00.000Z', updatedAt: '2025-01-03T00:00:00.000Z',
    },
    {
      id: 13, serviceName: 'Personal Visa', accountUsername: 'Alice Example', category: 'finance', entryType: 'card',
      encryptedBlob: enc(JSON.stringify({
        cardholder_name: 'Alice Example', card_number: '4111 1111 1111 1111', expiry_month: '7',
        expiry_year: '2029', cvv: '123', card_type: 'visa', nickname: 'blue card', limit: 5000,
      })),
      websiteUrl: '', isFavorite: false, createdAt: '2025-01-04T00:00:00.000Z', updatedAt: '2025-01-05T00:00:00.000Z',
    },
    {
      id: 14, serviceName: 'Odd card', accountUsername: '', category: 'finance', entryType: 'card',
      encryptedBlob: enc(JSON.stringify({ cardholder_name: 'Bob', card_number: '5500 0000 0000 0004', expiry_month: '13', expiry_year: 'xx', cvv: '', card_type: 'mastercard' })),
      websiteUrl: '', isFavorite: false, createdAt: '2025-01-06T00:00:00.000Z', updatedAt: '2025-01-06T00:00:00.000Z',
    },
    {
      id: 15, serviceName: 'Recovery codes', accountUsername: '', category: 'other', entryType: 'note',
      encryptedBlob: enc(JSON.stringify({ content: 'line one\nline two' })),
      websiteUrl: '', isFavorite: true, createdAt: '2025-01-07T00:00:00.000Z', updatedAt: '2025-01-08T00:00:00.000Z',
    },
    {
      id: 16, serviceName: 'Old mail', accountUsername: 'bob', category: 'email', entryType: 'password',
      encryptedBlob: enc('old secret', 'a different older password'),
      websiteUrl: 'https://mail.example.com', isFavorite: false, createdAt: '2024-05-01T00:00:00.000Z', updatedAt: '2024-05-01T00:00:00.000Z',
    },
    {
      id: 17, serviceName: 'Broken note', accountUsername: '', category: 'other', entryType: 'note',
      encryptedBlob: enc('this is not json'),
      websiteUrl: '', isFavorite: false, createdAt: '2024-06-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z',
    },
  ];
}
