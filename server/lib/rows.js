// Row -> camelCase response shapes.

const toUser = (r) => ({
  id: r.id,
  username: r.username,
  createdAt: r.created_at,
  profileImage: r.profile_image ?? null,
});

const toKdf = (r) =>
  r.auth_version === 2 && r.kdf_salt ? { salt: r.kdf_salt, params: r.kdf_params } : null;

// {user, authVersion, kdf, wrappedVaultKey}; kdf/wrappedVaultKey are null for v1.
const toSession = (r) => ({
  user: toUser(r),
  authVersion: r.auth_version,
  kdf: toKdf(r),
  wrappedVaultKey: r.auth_version === 2 ? r.wrapped_vault_key : null,
});

const toCollection = (r) => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  agentAccess: r.agent_access,
  wrappedKey: r.wrapped_key,
  sort: r.sort,
  createdAt: r.created_at,
});

const toItem = (r) => ({
  id: r.id,
  collectionId: r.collection_id,
  type: r.type,
  encrypted: r.encrypted,
  legacyEntryId: r.legacy_entry_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

const toHistory = (r) => ({
  id: r.id,
  collectionId: r.collection_id,
  type: r.type,
  encrypted: r.encrypted,
  versionUpdatedAt: r.version_updated_at,
  replacedAt: r.replaced_at,
});

const toLegacyEntry = (r) => ({
  id: r.id,
  serviceName: r.service_name,
  accountUsername: r.account_username,
  encryptedBlob: r.encrypted_blob,
  websiteUrl: r.website_url,
  category: r.category,
  entryType: r.entry_type,
  isFavorite: r.is_favorite,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toLoginLog = (r) => ({
  id: r.id,
  username: r.username,
  ipAddress: r.ip_address,
  success: r.success,
  userAgent: r.user_agent,
  createdAt: r.created_at,
});

module.exports = { toUser, toKdf, toSession, toCollection, toItem, toHistory, toLegacyEntry, toLoginLog };
