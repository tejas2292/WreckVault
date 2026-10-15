// Spawns the built bundle as an MCP server and drives it with the SDK client.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { makeFixture, startFakeServer } from './fakeServer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// WV_BUNDLE lets the same test drive a copy of the bundle outside the repo (no node_modules).
const BUNDLE = process.env.WV_BUNDLE || path.resolve(here, '../dist/wv.mjs');

describe('wv mcp (bundle over stdio)', () => {
  const fx = makeFixture({ canWrite: true });
  let srv;
  let client;
  let home;
  let stderr = '';

  beforeAll(async () => {
    if (!fs.existsSync(BUNDLE)) throw new Error('Run `npm run build` first (dist/wv.mjs is missing).');
    srv = await startFakeServer(fx);
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-mcp-'));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [BUNDLE, 'mcp'],
      env: { PATH: process.env.PATH, HOME: home, WV_CONNECTION: fx.connection(srv.url) },
      stderr: 'pipe',
    });
    transport.stderr?.on('data', (d) => { stderr += d; });
    client = new Client({ name: 'wv-test', version: '0.0.0' });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client?.close();
    await srv?.stop();
    if (home) fs.rmSync(home, { recursive: true, force: true });
  });

  it('initializes as "wreckvault" and lists the five tools', async () => {
    expect(client.getServerVersion().name).toBe('wreckvault');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['wv_get', 'wv_put', 'wv_search', 'wv_status', 'wv_update']);
    const get = tools.find((t) => t.name === 'wv_get');
    expect(get.description).toContain('$(wv get "<item>" "<field>")');
    expect(get.inputSchema.required).toEqual(['item']);
  });

  it('wv_search masks secret, multi and totp values', async () => {
    const r = await client.callTool({ name: 'wv_search', arguments: { query: 'git' } });
    expect(r.isError).toBeFalsy();
    const body = r.content[0].text;
    const data = JSON.parse(body);
    expect(data.items.map((i) => i.title).sort()).toEqual(['GitHub', 'GitHub bot token']);
    expect(body).toContain('[secret]');
    expect(body).not.toContain('gh-pass-123');
    expect(body).not.toContain('GEZDGNBV');
    expect(body).not.toContain('ghp_example');
    expect(body).not.toContain('line1');
    expect(data.items.find((i) => i.title === 'GitHub').fields.find((f) => f.label === 'Username').value).toBe('alice');
    const inactive = JSON.parse((await client.callTool({ name: 'wv_search', arguments: { query: 'staging' } })).content[0].text);
    expect(inactive.items.map((i) => i.title)).toEqual(['Staging DB']);
    const all = JSON.parse((await client.callTool({ name: 'wv_search', arguments: { query: 'staging', includeInactive: true } })).content[0].text);
    expect(all.count).toBe(2);
  });

  it('wv_get returns the value and logs an mcp read', async () => {
    const before = fx.reads.length;
    const r = await client.callTool({ name: 'wv_get', arguments: { item: 'Staging DB', field: 'password' } });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toBe('correct horse battery staple');
    expect(fx.reads.length).toBe(before + 1);
    expect(fx.decryptRead(fx.reads.at(-1))).toMatchObject({ field: 'Password', via: 'mcp' });
    const all = await client.callTool({ name: 'wv_get', arguments: { item: 'GitHub', field: '*' } });
    expect(JSON.parse(all.content[0].text).fields).toHaveLength(3);
    expect(fx.decryptRead(fx.reads.at(-1)).field).toBe('*');
  });

  it('errors come back as isError results and the server keeps running', async () => {
    const amb = await client.callTool({ name: 'wv_get', arguments: { item: 'git' } });
    expect(amb.isError).toBe(true);
    expect(amb.content[0].text).toContain('matches 2 items');
    const put = await client.callTool({ name: 'wv_put', arguments: { type: 'login', title: 'From MCP', fields: [{ label: 'Password', kind: 'secret', value: 'pw' }] } });
    expect(put.isError).toBeFalsy();
    const id = put.content[0].text.match(/id: (\S+)/)[1];
    expect(fx.decryptItem(id).title).toBe('From MCP');
    const upd = await client.callTool({ name: 'wv_update', arguments: { item: 'From MCP', setFields: [{ label: 'Password', value: 'pw2' }] } });
    expect(upd.isError).toBeFalsy();
    expect(fx.decryptItem(id).fields[0].value).toBe('pw2');
    fx.agent.canWrite = false;
    const denied = await client.callTool({ name: 'wv_update', arguments: { item: 'From MCP', notes: 'x' } });
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toContain('read-only');
    fx.agent.canWrite = true;
    const st = await client.callTool({ name: 'wv_status', arguments: {} });
    expect(st.content[0].text).toContain('Test laptop');
    expect(stderr).toContain('MCP server "wreckvault" running');
  });
});
