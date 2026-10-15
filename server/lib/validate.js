// Input validation helpers shared by the routes.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Must match TYPE_KEYS in client/src/lib/itemTypes.js.
const ITEM_TYPES = [
  'login', 'api_key', 'ssh_host', 'database', 'server', 'vpn', 'cloud_credential',
  'webhook', 'card', 'secure_note', 'identity', 'wifi', 'license',
];

const COLLECTION_KINDS = ['personal', 'alfred', 'custom'];

const DEFAULT_KDF_PARAMS = { alg: 'argon2id', m: 65536, t: 3, p: 1 };

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const isNonEmptyString = (v, max = Infinity) =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isItemType = (v) => typeof v === 'string' && ITEM_TYPES.includes(v);

// {salt, params}: salt = base64 of 16 bytes, params = an object.
const isKdf = (kdf) => {
  if (!isPlainObject(kdf) || typeof kdf.salt !== 'string' || !isPlainObject(kdf.params)) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(kdf.salt)) return false;
  return Buffer.from(kdf.salt, 'base64').length === 16;
};

// Throws a 400-shaped error describing the first problem in a collections array.
const checkCollections = (collections, { allowedKinds = COLLECTION_KINDS } = {}) => {
  if (!Array.isArray(collections) || collections.length === 0) {
    return 'Send at least one collection.';
  }
  const seen = new Set();
  for (const c of collections) {
    if (!isPlainObject(c)) return 'Each collection must be an object.';
    if (!isUuid(c.id)) return 'Each collection needs a UUID v4 id.';
    if (seen.has(c.id.toLowerCase())) return 'Collection ids must be unique.';
    seen.add(c.id.toLowerCase());
    if (!isNonEmptyString(c.name, 200)) return 'Each collection needs a name (up to 200 characters).';
    if (!allowedKinds.includes(c.kind)) return `Collection kind must be one of: ${allowedKinds.join(', ')}.`;
    if (c.agentAccess !== undefined && typeof c.agentAccess !== 'boolean') return 'agentAccess must be true or false.';
    if (!isNonEmptyString(c.wrappedKey)) return 'Each collection needs a wrappedKey.';
  }
  return null;
};

module.exports = {
  UUID_RE,
  ITEM_TYPES,
  COLLECTION_KINDS,
  DEFAULT_KDF_PARAMS,
  isUuid,
  isNonEmptyString,
  isPlainObject,
  isItemType,
  isKdf,
  checkCollections,
};
