// The single axios instance for the v2 API. Cookie session (withCredentials) and the
// CSRF header the server requires on every non-GET request.
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'X-WV-Client': '1', 'Content-Type': 'application/json' },
});

// The session provider registers a handler so an expired cookie anywhere in the app
// drops the keys and returns to the sign-in screen. A request can opt out with
// `{ skipAuthHandler: true }` in its config (used where 401 is an expected answer).
let unauthorizedHandler = null;
export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
  return () => { if (unauthorizedHandler === fn) unauthorizedHandler = null; };
}

api.interceptors.response.use(undefined, (err) => {
  if (err?.response?.status === 401 && !err.config?.skipAuthHandler && unauthorizedHandler) {
    try { unauthorizedHandler(err); } catch { /* ignore */ }
  }
  return Promise.reject(err);
});

// Turn an axios error into a sentence a person can act on.
export function errorMessage(err, fallback = 'Something went wrong. Try again.') {
  const fromServer = err?.response?.data?.error;
  if (typeof fromServer === 'string' && fromServer) return fromServer;
  if (err?.isAxiosError && !err.response) {
    return 'Could not reach the WreckVault server. Check your connection and try again.';
  }
  if (err?.response?.status === 429) return 'Too many attempts. Wait a few minutes and try again.';
  if (!err?.isAxiosError && err?.message) return err.message;
  return fallback;
}

export default api;
