# WreckVault

A self-hosted, zero-knowledge password and secrets manager. The browser does all the
encryption; the server stores ciphertext, ids, item types and timestamps, and never sees a
master password, a key or an item's contents.

v2 adds typed items (logins, API keys, SSH hosts, databases, servers, VPNs, cloud
credentials, webhooks, cards, secure notes, identities, Wi-Fi, licences), collections,
version history, trash, and a one-time in-browser upgrade for v1 vaults. The full build
contract is [docs/V2-SPEC.md](docs/V2-SPEC.md).

## Architecture

```
browser ──HTTP──> client container (nginx:1.27, port 80)
                    ├── /         built React SPA (Vite)
                    └── /api/  ──> backend-api container (Node 20 + Express, port 5000)
                                     └── PostgreSQL (external)
```

- **client/** — React + Vite SPA, served by nginx with a strict CSP. nginx proxies `/api/`
  to the API, so the app is same-origin.
- **server/** — Express API. `app.js` builds the app (`createApp(pool)`), `index.js` boots
  it, `db.js` holds the additive migrations and the cold-boot retry loop (30 tries × 5 s,
  then exit 1 so Docker restarts it).
- **Sessions** — an httpOnly, `SameSite=Strict` cookie holding a 12-hour HS256 JWT. Every
  non-GET request must send `X-WV-Client: 1` (CSRF guard). Login attempts are rate limited
  and recorded in `login_logs`.
- **Registration** is open only while the server has no users, or when
  `ALLOW_REGISTRATION=true`.

## Cryptography (client side)

- Master password → **Argon2id** (64 MiB, t=3, p=1, 16-byte salt) → master key.
- **HKDF-SHA256** splits it into an encryption key and an auth key. Only `base64(authKey)`
  is sent to the server, which stores a bcrypt hash of it.
- A random **vault key** is sealed with the encryption key; each collection has a random
  key sealed with the vault key; each item is sealed with its collection key.
- Sealing is **AES-256-GCM** with a fresh 12-byte nonce and associated data that binds the
  ciphertext to its item id and type.
- It works over plain HTTP on a LAN (no `crypto.subtle` needed): `@noble/ciphers`,
  `@noble/hashes`, `hash-wasm`, `crypto.getRandomValues`.

**v1 → v2 upgrade.** v1 encrypted each entry with CryptoJS AES using the raw master
password. On first v2 sign-in, the browser decrypts the v1 entries, re-encrypts them as v2
items, verifies every one, makes the person download a backup, and only then calls
`POST /api/auth/upgrade`. The server checks the upgrade covers every v1 entry exactly once.
The v1 rows and the v1 password hash are never modified, so rolling back to v1 keeps working.

## Local development

Requires Docker and Node 20+.

```bash
# Postgres 16 (host port 55432) + API + client (http://localhost:8088)
docker compose -f docker-compose.dev.yml -p wvdev up -d --build

# Optional: a v1 user to try the upgrade with (alice / "correct horse battery staple")
cd server && npm install
DATABASE_URL=postgres://wreckvault:wreckvault-dev-only@localhost:55432/wreckvault npm run seed:legacy
```

The dev stack's credentials are throwaway and only for that local stack. To run the API
outside Docker, copy `server/.env.example` to `server/.env` and point `DATABASE_URL` at a
database; the server also reads plain environment variables, and `.env` is optional.

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Postgres connection string (required) |
| `PORT` | API port, default 5000 |
| `ALLOW_REGISTRATION` | `true` keeps account creation open after the first user |

## Tests

Server tests use `node:test` and supertest against a real Postgres. Each test file creates
its own throwaway database next to the one in `DATABASE_URL` and drops it afterwards, so
the role needs `CREATEDB`:

```bash
cd server
DATABASE_URL=postgres://wreckvault:wreckvault-dev-only@localhost:55432/wreckvault npm test
```

Client lint, unit tests and build: `npm run lint`, `npm test`, `npm run build` in `client/`.

## Deploy

Production uses `docker-compose.yml`: the API image bakes in the source and reads
`DATABASE_URL` from `server/.env` on the host (`env_file`); the client image is a multi-stage
build served by nginx. Ports: client `3011`, API `3012`. The API joins the external
`postgresql_default` network to reach Postgres by container name.

GitHub Actions (`.github/workflows/deploy.yml`) runs client lint, tests and build plus the
server tests against a `postgres:16` service on every push to `main`, then a self-hosted
runner deploys with `docker compose -p wreckvault up -d --build`.

## Project layout

```
client/            React SPA, Dockerfile, nginx.conf
server/
  app.js           createApp(pool): middleware + routes
  index.js         boot: migrate (with retry), then listen
  db.js            pool, additive migrations, retry loop
  routes/          auth.js (auth, upgrade, legacy), vault.js (collections, items)
  lib/             session, validation, row mapping, helpers
  scripts/         seed-legacy.js (dev only)
  test/            node:test suites
docs/V2-SPEC.md    the v2 contract
```

## License

MIT
