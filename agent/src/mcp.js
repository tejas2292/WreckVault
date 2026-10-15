// `wv mcp`: stdio MCP server "wreckvault" (spec §8.5). Only MCP protocol goes to stdout;
// diagnostics go to stderr. Tool failures come back as isError results, never crashes.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Vault, publicItem, formatStatus } from './vault.js';
import { FIELD_KINDS, TYPE_KEYS, ITEM_STATUSES } from './itemTypes.js';
import { WvError } from './errors.js';
import { VERSION } from './commands.js';

const warn = (m) => process.stderr.write(`wv: ${m}\n`);
const text = (t) => ({ type: 'text', text: t });
const KINDS = Object.keys(FIELD_KINDS);

async function openVault() {
  return Vault.fromConfig({ warn }).load();
}

function withNote(v, content) {
  return v.offline ? [...content, text(`(${v.offlineNote}; reads are queued and will be logged later)`)] : content;
}

function safe(fn) {
  return async (args) => {
    try {
      return await fn(args ?? {});
    } catch (e) {
      if (!(e instanceof WvError)) warn(e?.stack || String(e));
      return { isError: true, content: [text(e instanceof WvError ? e.message : `Unexpected error: ${e?.message || e}`)] };
    }
  };
}

export function createMcpServer() {
  const server = new McpServer({ name: 'wreckvault', version: VERSION });

  server.registerTool('wv_search', {
    description: 'Search the WreckVault items this device can read (normally the ALFRED collection). '
      + 'Matches the query against title, project, type and tags. Returns id, title, type, project, tags, status '
      + 'and fields as {label, kind, value}; secret, long-text and one-time-code values are always shown as "[secret]" '
      + '(use wv_get, or better `$(wv get "<item>" "<field>")` in a shell command, to use one). '
      + 'Superseded and revoked items are left out unless includeInactive is true.',
    inputSchema: {
      query: z.string().optional().describe('Text to look for in title, project, type or tags (case-insensitive).'),
      type: z.enum(TYPE_KEYS).optional().describe('Only items of this type.'),
      project: z.string().optional().describe('Only items whose project equals this (case-insensitive).'),
      includeInactive: z.boolean().optional().describe('Also return superseded and revoked items. Default false.'),
    },
  }, safe(async ({ query, type, project, includeInactive }) => {
    const v = await openVault();
    const items = v.list({ query, type, project, includeInactive: includeInactive === true }).map(publicItem);
    return { content: withNote(v, [text(JSON.stringify({ count: items.length, items }, null, 2))]) };
  }));

  server.registerTool('wv_get', {
    description: 'Get a secret or other field value from WreckVault. Every call is logged as a read on the item. '
      + 'PREFER NOT TO CALL THIS: when the value is only needed inside a shell command, use the shell form '
      + '`$(wv get "<item>" "<field>")` in the Bash command instead (e.g. `PGPASSWORD="$(wv get "Staging DB")" psql ...`), '
      + 'so the secret never enters the conversation transcript. Call this tool only when you must see the value itself. '
      + '`item` is an id or a title (exact title wins, else a unique substring). `field` is a field label '
      + '(case-insensitive); omitted = the first secret field; "*" = every field of the item. '
      + 'A one-time-code field returns the current code.',
    inputSchema: {
      item: z.string().min(1).describe('Item id or title.'),
      field: z.string().optional().describe('Field label, or "*" for all fields. Default: the first secret field.'),
    },
  }, safe(async ({ item, field }) => {
    const v = await openVault();
    const r = await v.get(item, field, { via: 'mcp' });
    const body = r.fields ? JSON.stringify({ id: r.item.id, title: r.item.title, fields: r.fields }, null, 2) : r.value;
    return { content: withNote(v, [text(body)]) };
  }));

  server.registerTool('wv_put', {
    description: 'Create a new WreckVault item in the ALFRED collection (or the named granted collection). '
      + 'Needs a device connected with "Read and write" permission. The item is encrypted on this machine before upload.',
    inputSchema: {
      type: z.enum(TYPE_KEYS).describe('Item type.'),
      title: z.string().min(1).describe('Item title.'),
      fields: z.array(z.object({
        label: z.string().min(1).describe('Field label, e.g. "Password".'),
        kind: z.enum(KINDS).describe('Field kind: secret values use "secret".'),
        value: z.string().describe('Field value.'),
      })).describe('Fields in display order.'),
      project: z.string().optional().describe('Project name, e.g. "GLIDE_CRM".'),
      tags: z.array(z.string()).optional().describe('Tags.'),
      notes: z.string().optional().describe('Free-text notes.'),
      collection: z.string().optional().describe('Collection name or id. Default: ALFRED.'),
    },
  }, safe(async (args) => {
    const v = await openVault();
    const r = await v.put(args);
    return { content: [text(`Created "${r.title}" (${r.type}) in ${r.collection}. id: ${r.id}`)] };
  }));

  server.registerTool('wv_update', {
    description: 'Update an existing WreckVault item. Only the parts you pass change; every other field and '
      + 'payload key is kept. setFields updates a field with the same label (case-insensitive) or adds it; '
      + 'removeFields deletes fields by label. To rotate a credential, either update the value or create a new item '
      + 'with wv_put and mark the old one status "superseded" with supersededBy = the new id. Needs write permission.',
    inputSchema: {
      item: z.string().min(1).describe('Item id or title.'),
      setFields: z.array(z.object({
        label: z.string().min(1),
        kind: z.enum(KINDS).optional().describe('Only needed for a new field (default "text") or to change the kind.'),
        value: z.string(),
      })).optional().describe('Fields to set or add.'),
      removeFields: z.array(z.string()).optional().describe('Labels of fields to remove.'),
      title: z.string().optional(),
      notes: z.string().optional(),
      tags: z.array(z.string()).optional().describe('Replaces the tag list.'),
      project: z.string().optional(),
      status: z.enum(ITEM_STATUSES).optional(),
      supersededBy: z.string().nullable().optional().describe('Id of the item that replaces this one, or null.'),
    },
  }, safe(async ({ item, ...change }) => {
    const v = await openVault();
    const r = await v.update(item, change);
    return { content: [text(`Updated "${r.title}" (${r.type}) in ${r.collection}. id: ${r.id}`)] };
  }));

  server.registerTool('wv_status', {
    description: 'Show the WreckVault connection: server, device name, permission (read only / read and write), '
      + 'granted collections, item count and cache age.',
    inputSchema: {},
  }, safe(async () => {
    const v = await openVault();
    return { content: [text(formatStatus(v.status()))] };
  }));

  return server;
}

export async function startMcp() {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
  warn('MCP server "wreckvault" running on stdio');
}
