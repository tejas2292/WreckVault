// Config and cache locations (spec §8.5). Resolved lazily so HOME/APPDATA changes apply.
import os from 'node:os';
import path from 'node:path';

const isWin = () => process.platform === 'win32';

export function configFile() {
  if (isWin()) {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, 'wreckvault', 'agent.json');
  }
  return path.join(os.homedir(), '.config', 'wreckvault', 'agent.json');
}

export function cacheFile() {
  if (isWin()) {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, 'wreckvault', 'agent-cache.json');
  }
  return path.join(os.homedir(), '.cache', 'wreckvault', 'agent-cache.json');
}
