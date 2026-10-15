import { describe, it, expect } from 'vitest';
import { parseCsv, parseImport, buildExport, EXPORT_FORMAT } from './exportImport.js';
import { decryptedItem, unreadableItem } from './itemModel.js';
import { decryptLegacyRows, buildLegacyBackup } from './legacy.js';
import { makeV1Rows, V1_PASSWORD } from './testData.js';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas, newlines, CRLF, BOM and a trailing newline', () => {
    const text = '﻿name,url,username,password,notes\r\n'
      + '"Acme, Inc",https://acme.example.com,alice,"pa""ss,word","line 1\nline 2"\r\n'
      + 'Plain,,bob,secret,\r\n'
      + '"","","","",""\n';
    expect(parseCsv(text)).toEqual([
      ['name', 'url', 'username', 'password', 'notes'],
      ['Acme, Inc', 'https://acme.example.com', 'alice', 'pa"ss,word', 'line 1\nline 2'],
      ['Plain', '', 'bob', 'secret', ''],
      ['', '', '', '', ''],
    ]);
  });
  it('keeps empty trailing fields and lone CR line endings', () => {
    expect(parseCsv('a,b,\rc,,d')).toEqual([['a', 'b', ''], ['c', '', 'd']]);
  });
  it('rejects an unclosed quote', () => {
    expect(() => parseCsv('a,"b\nc')).toThrow(/unclosed quote/);
  });
});

describe('parseImport', () => {
  it('CSV (Chrome style) -> login drafts; blank rows skipped', () => {
    const csv = 'name,url,username,password,note\n'
      + '"Acme, Inc",https://acme.example.com,alice,"pa""ss",hello\n'
      + ',https://nohost.example.com/login,,pw2,\n'
      + ',,,,\n';
    const r = parseImport(csv, 'passwords.csv');
    expect(r.format).toBe('csv');
    expect(r.skipped).toBe(1);
    expect(r.drafts).toHaveLength(2);
    expect(r.drafts[0]).toMatchObject({ type: 'login', title: 'Acme, Inc', notes: 'hello' });
    expect(r.drafts[0].fields.map((f) => [f.label, f.kind, f.value])).toEqual([
      ['Username', 'text', 'alice'], ['Password', 'secret', 'pa"ss'], ['Website', 'url', 'https://acme.example.com'],
    ]);
    expect(r.drafts[1].title).toBe('nohost.example.com');
  });

  it('CSV (Bitwarden column names) is accepted; a CSV without the columns is refused', () => {
    const r = parseImport('folder,name,login_uri,login_username,login_password,notes\nx,Site,https://s.example.com,u,p,n\n');
    expect(r.drafts[0]).toMatchObject({ title: 'Site', notes: 'n' });
    expect(() => parseImport('foo,bar\n1,2\n', 'x.csv')).toThrow(/header row/);
  });

  it('v1 export array (incl. the pre-upgrade backup with raw rows)', () => {
    const backup = buildLegacyBackup(decryptLegacyRows(makeV1Rows(), V1_PASSWORD));
    const r = parseImport(JSON.stringify(backup), 'wreckvault-backup.json');
    expect(r.format).toBe('wreckvault-v1');
    expect(r.skipped).toBe(0);
    expect(r.drafts.map((d) => d.type)).toEqual(['login', 'login', 'card', 'card', 'secure_note', 'secure_note', 'secure_note']);
    expect(r.drafts[2].fields.find((f) => f.label === 'Expiry').value).toBe('07 / 29');
    expect(r.drafts[5].title).toBe('Old mail (could not decrypt)');
    const skippedOnes = parseImport(JSON.stringify([{ service_name: 'x', entry_type: 'password' }, { nope: 1 }]));
    expect(skippedOnes).toMatchObject({ drafts: [], skipped: 2 });
  });

  it('rejects unknown JSON and empty files', () => {
    expect(() => parseImport('{"hello":1}')).toThrow(/not a WreckVault export/);
    expect(() => parseImport('   ')).toThrow(/empty/);
    expect(() => parseImport('{bad json', 'x.json')).toThrow(/could not be read/);
  });
});

describe('export -> import round trip', () => {
  it('keeps every payload field and the type; skips unreadable items', () => {
    const items = [
      decryptedItem({ id: 'a', type: 'ssh_host', collectionId: 'c', createdAt: 't1', updatedAt: 't2', deletedAt: null, legacyEntryId: null }, {
        title: 'Build box', fields: [{ id: 'f1', label: 'Host', kind: 'mono', value: '10.0.0.5' }, { id: 'f2', label: 'Password', kind: 'secret', value: 'pw' }],
        notes: 'n', tags: ['infra'], project: 'demo', favorite: true, status: 'superseded', supersededBy: 'b', links: ['b'],
        attachments: [{ id: 'a1', name: 'id_ed25519', mime: 'application/octet-stream', size: 3, data: 'AAEC' }],
      }),
      decryptedItem({ id: 'b', type: 'wifi', collectionId: 'c', deletedAt: '2026-01-01T00:00:00.000Z' }, { title: 'Home', fields: [] }),
      unreadableItem({ id: 'z', type: 'login', collectionId: 'c' }),
    ];
    const exported = buildExport(items, '2026-01-01T00:00:00.000Z');
    expect(exported.format).toBe(EXPORT_FORMAT);
    expect(exported.items).toHaveLength(2);
    const r = parseImport(JSON.stringify(exported), 'wreckvault-export.json');
    expect(r.format).toBe('wreckvault-v2');
    expect(r.drafts).toHaveLength(2);
    const strip = (i) => {
      const o = { ...i };
      for (const k of ['id', 'collectionId', 'createdAt', 'updatedAt', 'deletedAt', 'legacyEntryId', 'v']) delete o[k];
      return o;
    };
    expect(strip(r.drafts[0])).toEqual(strip(items[0]));
    expect(r.drafts[1].deletedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
