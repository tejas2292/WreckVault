// wv commands (spec §8.5). `run` returns the exit code (null = keep running, for `wv mcp`).
import { Vault, publicItem, formatStatus, MASK, isSecretKind } from './vault.js';
import { login, logout } from './login.js';
import { readHidden } from './prompt.js';
import { WvError, EXIT } from './errors.js';
import { TYPE_KEYS } from './itemTypes.js';

export const VERSION = '0.1.0';

const HELP = `wv ${VERSION} - WreckVault agent for Claude Code

Usage:
  wv login [connection-string]   Save this device's connection (prompts, hidden, if omitted)
  wv logout                      Delete the saved connection and cache
  wv status                      Server, device, permission, collections, item count, cache age
  wv ls [query] [--type T] [--project P] [--json]
  wv get <item> [field]          Print one value (default: the first secret field); logs a read
                                 A one-time code field prints the current code (--raw: the secret)
  wv show <item> [--reveal]      All fields; secrets masked unless --reveal (logs a "*" read)
  wv guard                       Refresh the local guard hash list (no secrets stored) and show its size
  wv mcp                         Run the MCP server on stdio (for Claude Code)

<item> is an id or a title (exact match wins, else a unique substring).
Exit codes: 0 ok, 1 error, 2 ambiguous or not found, 3 not logged in, 4 server unreachable and no cache.
Env WV_CONNECTION overrides the saved login.
Item types: ${TYPE_KEYS.join(', ')}`;

const VALUE_FLAGS = new Set(['--type', '--project']);

export function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { pos.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq > 0 ? a.slice(0, eq) : a;
      if (VALUE_FLAGS.has(name)) {
        const v = eq > 0 ? a.slice(eq + 1) : argv[++i];
        if (v === undefined) throw new WvError(`${name} needs a value.`);
        flags[name.slice(2)] = v;
      } else {
        flags[name.slice(2)] = true;
      }
    } else if (a === '-h') {
      flags.help = true;
    } else {
      pos.push(a);
    }
  }
  return { pos, flags };
}

function table(rows, headers) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join('  ').trimEnd();
  return [line(headers), ...rows.map(line)].join('\n');
}

export async function run(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const out = (s) => stdout.write(s);
  const err = (s) => stderr.write(s);
  const vaultOpts = { warn: (m) => err(`wv: ${m}\n`), ...(io.vaultOpts || {}) };

  const { pos, flags } = parseArgs(argv);
  const cmd = pos.shift();
  if (flags.version) { out(`${VERSION}\n`); return EXIT.OK; }
  if (!cmd || flags.help || cmd === 'help') { out(`${HELP}\n`); return EXIT.OK; }

  const open = async () => {
    const v = await Vault.fromConfig(vaultOpts).load();
    if (v.offline) err(`wv: ${v.offlineNote}\n`);
    return v;
  };

  switch (cmd) {
    case 'login': {
      let s = pos[0];
      if (!s) s = await (io.readHidden || readHidden)('Connection string (input hidden): ');
      if (!String(s || '').trim()) throw new WvError('No connection string given.');
      const { file, vault } = await login(s, vaultOpts);
      const st = vault.status();
      out(`Logged in as "${st.device}" (${st.permission}) on ${st.server}.\n`);
      out(`Collections: ${st.collections.map((c) => `${c.name} (${c.items})`).join(', ')}\nSaved to ${file}\n`);
      if (process.env.WV_CONNECTION) err('wv: note: WV_CONNECTION is set and overrides the saved login.\n');
      return EXIT.OK;
    }
    case 'logout': {
      const removed = logout();
      out(removed ? 'Logged out; the saved connection and cache were deleted.\n' : 'Nothing to delete; this device was not logged in.\n');
      return EXIT.OK;
    }
    case 'status': {
      const v = await open();
      out(`${formatStatus(v.status())}\n`);
      return EXIT.OK;
    }
    case 'guard': {
      const v = await open();
      const doc = v.refreshGuard();
      if (!doc) throw new WvError('The guard hash list could not be written.', EXIT.ERROR);
      out(`Guard hash list: ${doc.count} values watched (from ${v.readable().length} items).\n`);
      return EXIT.OK;
    }
    case 'ls': {
      const v = await open();
      const items = v.list({ query: pos[0], type: flags.type, project: flags.project });
      if (flags.json) { out(`${JSON.stringify(items.map(publicItem), null, 2)}\n`); return EXIT.OK; }
      if (!items.length) { err('wv: no items match.\n'); return EXIT.OK; }
      out(`${table(items.map((it) => [it.title, it.type, it.project || '-', it.status, it.tags.join(',') || '-', it.id]), ['TITLE', 'TYPE', 'PROJECT', 'STATUS', 'TAGS', 'ID'])}\n`);
      return EXIT.OK;
    }
    case 'get': {
      if (!pos[0]) throw new WvError('Usage: wv get <item> [field]', EXIT.ERROR);
      const v = await open();
      const r = await v.get(pos[0], pos[1], { via: 'cli', raw: !!flags.raw });
      const text = r.fields ? JSON.stringify(r.fields, null, 2) : r.value;
      out(stdout.isTTY ? `${text}\n` : text);
      return EXIT.OK;
    }
    case 'show': {
      if (!pos[0]) throw new WvError('Usage: wv show <item> [--reveal]', EXIT.ERROR);
      const v = await open();
      const it = v.find(pos[0]);
      if (flags.reveal) await v.logRead(it, '*', 'cli');
      const lines = [
        it.title,
        `  Type:       ${it.type}`,
        `  Collection: ${it.collection ?? '-'}`,
        it.project ? `  Project:    ${it.project}` : null,
        it.tags.length ? `  Tags:       ${it.tags.join(', ')}` : null,
        `  Status:     ${it.status}${it.supersededBy ? ` (superseded by ${it.supersededBy})` : ''}`,
        `  Id:         ${it.id}`,
        '',
        ...(() => {
          const w = Math.max(0, ...it.fields.map((f) => f.label.length));
          return it.fields.map((f) => {
            const val = isSecretKind(f.kind) && !flags.reveal ? (f.value ? MASK : '') : f.value;
            const shown = String(val).includes('\n') ? `\n    ${String(val).replace(/\n/g, '\n    ')}` : val;
            return `  ${f.label.padEnd(w)}  ${shown}`;
          });
        })(),
        it.notes ? `\nNotes:\n  ${it.notes.replace(/\n/g, '\n  ')}` : null,
        it.attachments.length ? `\nAttachments: ${it.attachments.map((a) => a?.name).join(', ')}` : null,
      ].filter((l) => l !== null);
      out(`${lines.join('\n')}\n`);
      if (!flags.reveal && it.fields.some((f) => isSecretKind(f.kind))) err('wv: secrets masked; add --reveal to show them (logged as a read).\n');
      return EXIT.OK;
    }
    case 'mcp': {
      const { startMcp } = await import('./mcp.js');
      await startMcp();
      return null; // keep running
    }
    default:
      throw new WvError(`Unknown command "${cmd}". Run \`wv --help\`.`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const code = await run(argv);
    if (code !== null) process.exitCode = code;
  } catch (e) {
    const code = e instanceof WvError ? e.exitCode : EXIT.ERROR;
    process.stderr.write(`wv: ${e instanceof WvError ? e.message : (e?.stack || String(e))}\n`);
    process.exitCode = code;
  }
}

