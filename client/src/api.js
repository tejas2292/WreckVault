import axios from 'axios';

const api = axios.create({
  baseURL: '/api', // Proxy in vite.config.js handles specific target
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
