// Agent API client (spec §8.3): Bearer wva1.<agentId>.<agentToken>, 10 s timeout.
import { NetworkError, ApiError } from './errors.js';

export const TIMEOUT_MS = 10000;

export function createHttp({ server, agentId, agentToken, timeoutMs = TIMEOUT_MS }) {
  const auth = `Bearer wva1.${agentId}.${agentToken}`;

  async function request(method, path, body) {
    const url = `${server}/api${path}`;
    let res;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      res = await fetch(url, {
        method,
        headers: { Authorization: auth, Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch (e) {
      const why = ctrl.signal.aborted ? `no answer within ${timeoutMs / 1000} s` : (e.cause?.code || e.cause?.message || e.message);
      throw new NetworkError(`Cannot reach the WreckVault server at ${server} (${why}).`);
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      const msg = (data && typeof data.error === 'string' && data.error) || `HTTP ${res.status} ${res.statusText}`.trim();
      const hint = res.status === 401 ? ' This device may have been revoked; run `wv login` with a new connection string.' : '';
      throw new ApiError(res.status, `The server refused the request: ${msg}${hint}`);
    }
    return data;
  }

  return {
    me: () => request('GET', '/agent/v1/me'),
    items: () => request('GET', '/agent/v1/items'),
    createItem: (row) => request('POST', '/agent/v1/items', row),
    updateItem: (id, row) => request('PUT', `/agent/v1/items/${encodeURIComponent(id)}`, row),
    logRead: (itemId, read) => request('POST', `/agent/v1/items/${encodeURIComponent(itemId)}/reads`, read),
  };
}
