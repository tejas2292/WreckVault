import { describe, it, expect } from 'vitest';
import {
  decryptLegacyRow, decryptLegacyRows, mapLegacyRow, formatExpiry, summarizeLegacy, buildLegacyBackup, UNDECRYPTABLE_TAG,
} from './legacy.js';
import { makeV1Rows, V1_PASSWORD } from './testData.js';

const rows = makeV1Rows();
const byId = (id) => rows.find((r) => r.id === id);
const mapped = (id) => mapLegacyRow(byId(id), decryptLegacyRow(byId(id), V1_PASSWORD));
const field = (item, label) => item.payload.fields.find((f) => f.label === label);
const labels = (item) => item.payload.fields.map((f) => f.label);

describe('legacy decrypt', () => {
  it('decrypts like v1 and flags failures', () => {
    expect(decryptLegacyRow(byId(11), V1_PASSWORD)).toMatchObject({ ok: true, kind: 'password', text: 'hunter2' });
    expect(decryptLegacyRow(byId(13), V1_PASSWORD)).toMatchObject({ ok: true, kind: 'card' });
    expect(decryptLegacyRow(byId(16), V1_PASSWORD)).toEqual({ ok: false, kind: 'password' });
    expect(decryptLegacyRow(byId(17), V1_PASSWORD)).toEqual({ ok: false, kind: 'note' }); // not JSON
    expect(decryptLegacyRow(byId(11), 'wrong password').ok).toBe(false);
    expect(decryptLegacyRow({ ...byId(11), encryptedBlob: 'garbage' }, V1_PASSWORD).ok).toBe(false);
  });
});

describe('legacy mapping', () => {
  it('password row -> login with Username/Password/Website, tag, favourite and dates', () => {
    const m = mapped(11);
    expect(m.type).toBe('login');
    expect(m.legacyEntryId).toBe(11);
    expect(m.payload.title).toBe('GitHub');
    expect(m.payload.fields).toEqual([
      { id: 'f1', label: 'Username', kind: 'text', value: 'alice' },
      { id: 'f2', label: 'Password', kind: 'secret', value: 'hunter2' },
      { id: 'f3', label: 'Website', kind: 'url', value: 'https://github.example.com' },
    ]);
    expect(m.payload.tags).toEqual(['development']);
    expect(m.payload.favorite).toBe(true);
    expect(m.createdAt).toBe('2025-01-02T03:04:05.000Z');
    expect(m.updatedAt).toBe('2025-02-03T04:05:06.000Z');
    expect(m.payload).toMatchObject({ v: 1, notes: '', project: '', status: 'active', supersededBy: null, links: [], attachments: [] });
  });

  it('null entryType -> login, empty username/website omitted, category "other" not tagged', () => {
    const m = mapped(12);
    expect(m.type).toBe('login');
    expect(labels(m)).toEqual(['Password']);
    expect(field(m, 'Password').value).toBe('pa,ss"word');
    expect(m.payload.tags).toEqual([]);
    expect(m.payload.favorite).toBe(false);
  });

  it('card -> card with MM / YY expiry and extra keys kept as text fields', () => {
    const m = mapped(13);
    expect(m.type).toBe('card');
    expect(labels(m)).toEqual(['Cardholder', 'Number', 'Expiry', 'CVV', 'Card type', 'nickname', 'limit']);
    expect(field(m, 'Number')).toMatchObject({ kind: 'secret', value: '4111 1111 1111 1111' });
    expect(field(m, 'Expiry')).toMatchObject({ kind: 'mono', value: '07 / 29' });
    expect(field(m, 'CVV')).toMatchObject({ kind: 'secret', value: '123' });
    expect(field(m, 'Card type')).toMatchObject({ kind: 'text', value: 'visa' });
    expect(field(m, 'nickname')).toMatchObject({ kind: 'text', value: 'blue card' });
    expect(field(m, 'limit')).toMatchObject({ kind: 'text', value: '5000' });
    expect(m.payload.tags).toEqual(['finance']);
  });

  it('card expiry keeps raw values when they do not fit', () => {
    expect(field(mapped(14), 'Expiry').value).toBe('13 / xx');
    expect(formatExpiry('12', '26')).toBe('12 / 26');
    expect(formatExpiry('1', '2031')).toBe('01 / 31');
    expect(formatExpiry('', '')).toBe('');
    expect(formatExpiry('05', '')).toBe('05');
  });

  it('note -> secure_note with Content(multi)', () => {
    const m = mapped(15);
    expect(m.type).toBe('secure_note');
    expect(m.payload.fields).toEqual([{ id: 'f1', label: 'Content', kind: 'multi', value: 'line one\nline two' }]);
    expect(m.payload.favorite).toBe(true);
  });

  it('undecryptable rows are kept verbatim as a tagged secure note', () => {
    for (const id of [16, 17]) {
      const row = byId(id);
      const m = mapped(id);
      expect(m.undecryptable).toBe(true);
      expect(m.type).toBe('secure_note');
      expect(m.payload.title).toBe(`${row.serviceName} (could not decrypt)`);
      expect(m.payload.tags[0]).toBe(UNDECRYPTABLE_TAG);
      expect(field(m, 'Original encrypted data')).toMatchObject({ kind: 'multi', value: row.encryptedBlob });
      expect(m.payload.notes).toMatch(/older master password/);
      expect(m.legacyEntryId).toBe(id);
      expect(m.createdAt).toBe(row.createdAt);
    }
    const m16 = mapped(16);
    expect(labels(m16)).toEqual(['Username', 'Website', 'Original encrypted data']);
    expect(m16.payload.tags).toEqual([UNDECRYPTABLE_TAG, 'email']);
    expect(labels(mapped(17))).toEqual(['Original encrypted data']);
  });

  it('summary and backup', () => {
    const dec = decryptLegacyRows(rows, V1_PASSWORD);
    expect(summarizeLegacy(dec)).toEqual({ total: 7, decryptable: 5, undecryptable: 2, byType: { password: 3, card: 2, note: 2 } });
    const backup = buildLegacyBackup(dec, '2026-01-01T00:00:00.000Z');
    expect(backup).toHaveLength(7);
    expect(backup[0]).toEqual({
      service_name: 'GitHub', account_username: 'alice', password: 'hunter2', website_url: 'https://github.example.com',
      category: 'development', entry_type: 'password', decrypted_data: null, exported_at: '2026-01-01T00:00:00.000Z',
    });
    expect(backup[1].entry_type).toBe('password');
    expect(backup[2].decrypted_data.card_number).toBe('4111 1111 1111 1111');
    expect(backup[5]).toEqual({ ...byId(16), undecryptable: true });
  });
});
