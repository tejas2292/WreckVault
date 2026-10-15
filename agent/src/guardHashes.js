// Guard hash list: lets local tools (a Claude Code write guard, a redaction script) notice a vault
// secret in text WITHOUT keeping the secret on disk. Written on every successful load to
// ~/.cache/wreckvault/guard-hashes.json (0600) as keyed HMAC-SHA256 digests (128-bit) of the
// candidate literals, plus the set of their lengths so a checker knows which substrings to hash.
//
// Candidates follow the same precision rules the ALFRED secret guard has always used (a guard
// that fires on ordinary words gets switched off): from `secret`/`totp` fields the value itself,
// and from long-text fields every backticked value in a `| label | value |` row whose label names
// a secret. Each candidate must pass the entropy gate below.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { cacheFile } from './paths.js';
import { writePrivateJson, readJson } from './files.js';

export const guardFile = () => path.join(path.dirname(cacheFile()), 'guard-hashes.json');

const SECRET_LABEL = /(password|passwd|token|api[\s_-]?key|secret|credential|passphrase|\bpin\b|client[\s_-]?secret|private[\s_-]?key|auth[\s_-]?key|access[\s_-]?key)/i;
const NOT_A_VALUE = /(set in|stored in|source|used for|scope|path|where|canonical|rotate|verified)/i;

export function passesGate(raw) {
  const v = String(raw ?? '').trim();
  if (v.length < 10 || v.length > 200) return false;
  if (/\s/.test(v)) return false;
  if (/^<.*>$/.test(v)) return false;
  if (/^(see|n\/a|none|unset|tbd|redacted)$/i.test(v)) return false;
  if (/SECRETS\.md/i.test(v)) return false;
  if (!/[0-9]/.test(v) || !/[A-Za-z]/.test(v)) return false;
  if (!/[A-Z]/.test(v) && !/[^A-Za-z0-9]/.test(v)) return false;
  if (/^\d+\.\d+\.\d+\.\d+/.test(v)) return false;
  if (/\.(md|js|ts|json|yml|yaml|sh|py|sql|ejs|php|conf)$/i.test(v)) return false;
  if (/^[a-z][a-z0-9_]*$/.test(v)) return false;
  if (/@/.test(v) && /\./.test(v)) return false;
  if (/^(z_glide|portal_|trt_|pmt_)/i.test(v)) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return false;
  if (/^(Glide-|GLIDE-|wrecker|IDT-|UP-)/i.test(v)) return false;
  if (/^\w+=https?:/i.test(v)) return false;
  return true;
}

export function literalsFromText(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 3) continue;
    const label = cells[1];
    if (!SECRET_LABEL.test(label) || NOT_A_VALUE.test(label)) continue;
    for (const m of cells.slice(2).join(' | ').matchAll(/`([^`\n]{6,160})`/g)) out.push(m[1].trim());
  }
  return out;
}

export function candidateLiterals(items) {
  const set = new Set();
  for (const it of items) {
    for (const f of it.fields || []) {
      if (f.kind === 'secret' || f.kind === 'totp') set.add(String(f.value ?? '').trim());
      if (f.kind === 'multi') for (const v of literalsFromText(f.value)) set.add(v);
    }
  }
  return [...set].filter(passesGate);
}

export const digest = (keyBuf, value) => crypto.createHmac('sha256', keyBuf).update(value, 'utf8').digest('hex').slice(0, 32);
// Keyed hash of a value's first PREFIX_LEN characters: a cheap pre-filter so a checker only runs
// the full comparison at positions where a secret could start.
export const PREFIX_LEN = 4;
export const prefixDigest = (keyBuf, value) => digest(keyBuf, `prefix:${value.slice(0, PREFIX_LEN)}`);

export function writeGuardHashes(items, { device } = {}) {
  const literals = candidateLiterals(items);
  const prev = readJson(guardFile());
  const key = prev?.key ? Buffer.from(prev.key, 'base64') : crypto.randomBytes(32);
  const doc = {
    v: 1,
    alg: 'hmac-sha256-128',
    key: key.toString('base64'),
    lengths: [...new Set(literals.map((v) => v.length))].sort((a, b) => a - b),
    hashes: [...new Set(literals.map((v) => digest(key, v)))].sort(),
    prefixLen: PREFIX_LEN,
    prefixes: [...new Set(literals.map((v) => prefixDigest(key, v)))].sort(),
    count: literals.length,
    device: device || null,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(guardFile()), { recursive: true });
  writePrivateJson(guardFile(), doc);
  return doc;
}
