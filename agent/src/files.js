// Private JSON files: directory 0700, file 0600, written atomically.
import fs from 'node:fs';
import path from 'node:path';

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    return null; // a corrupt file is treated as missing
  }
}

export function writePrivateJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  try { fs.chmodSync(tmp, 0o600); } catch { /* not supported on this filesystem */ }
  fs.renameSync(tmp, file);
}

export function removeFile(file) {
  try {
    fs.unlinkSync(file);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}
