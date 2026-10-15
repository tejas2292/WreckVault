import { describe, it, expect } from 'vitest';
import { resolveItem, resolveField } from '../src/resolve.js';
import { mergePayload, buildPayload } from '../src/payload.js';
import { parseArgs } from '../src/commands.js';

const mk = (id, title, status = 'active', fields = []) => ({ id, title, type: 'login', project: '', status, fields });
const items = [
  mk('11111111-1111-4111-8111-111111111111', 'GitHub'),
  mk('22222222-2222-4222-8222-222222222222', 'GitHub bot token'),
  mk('33333333-3333-4333-8333-333333333333', 'Staging DB'),
  mk('44444444-4444-4444-8444-444444444444', 'Prod DB'),
  mk('55555555-5555-4555-8555-555555555555', 'Wi-Fi home', 'superseded'),
  mk('66666666-6666-4666-8666-666666666666', 'Wi-Fi home (new)'),
];

describe('item resolution (§8.5)', () => {
  it('matches by id', () => {
    expect(resolveItem(items, '33333333-3333-4333-8333-333333333333').title).toBe('Staging DB');
  });
  it('exact title (case-insensitive) wins over substrings', () => {
    expect(resolveItem(items, 'github').id).toBe(items[0].id);
  });
  it('unique substring', () => {
    expect(resolveItem(items, 'bot').title).toBe('GitHub bot token');
    expect(resolveItem(items, 'staging').title).toBe('Staging DB');
  });
  it('ambiguous → exit 2 with candidates', () => {
    let e;
    try { resolveItem(items, 'db'); } catch (x) { e = x; }
    expect(e.exitCode).toBe(2);
    expect(e.message).toContain('Staging DB');
    expect(e.message).toContain('Prod DB');
    expect(e.candidates).toHaveLength(2);
  });
  it('a single active candidate breaks a tie with superseded copies', () => {
    expect(resolveItem(items, 'wi-fi').title).toBe('Wi-Fi home (new)');
  });
  it('not found → exit 2', () => {
    expect(() => resolveItem(items, 'nothing')).toThrow(expect.objectContaining({ exitCode: 2 }));
  });
});

describe('field resolution', () => {
  const it2 = { title: 'X', fields: [
    { label: 'User', kind: 'text', value: 'alice' },
    { label: 'Password', kind: 'secret', value: 'p1' },
    { label: 'PIN', kind: 'secret', value: 'p2' },
  ] };
  it('default is the first secret field', () => { expect(resolveField(it2, undefined).label).toBe('Password'); });
  it('case-insensitive label', () => { expect(resolveField(it2, 'pin').value).toBe('p2'); });
  it('missing field → exit 2', () => { expect(() => resolveField(it2, 'nope')).toThrow(expect.objectContaining({ exitCode: 2 })); });
  it('no secret field → exit 2', () => {
    expect(() => resolveField({ title: 'Y', fields: [{ label: 'a', kind: 'text', value: '' }] })).toThrow(expect.objectContaining({ exitCode: 2 }));
  });
});

describe('payload merge', () => {
  const raw = {
    v: 1, title: 'Old', notes: 'n', tags: ['a'], project: 'P', favorite: true, status: 'active', supersededBy: null,
    links: ['x'], attachments: [{ id: 'a1', name: 'k', data: 'AA==' }], futureKey: { deep: [1, 2] },
    fields: [
      { id: 'f1', label: 'User', kind: 'text', value: 'alice', extra: 'keep-me' },
      { id: 'f2', label: 'Password', kind: 'secret', value: 'old' },
      { id: 'f3', label: 'Gone', kind: 'text', value: 'bye' },
    ],
  };
  it('preserves unknown keys and untouched fields', () => {
    const out = mergePayload(raw, { setFields: [{ label: 'password', value: 'new' }, { label: 'Port', kind: 'mono', value: '22' }], removeFields: ['gone'], title: 'New' });
    expect(out.futureKey).toEqual({ deep: [1, 2] });
    expect(out.attachments).toEqual(raw.attachments);
    expect(out.favorite).toBe(true);
    expect(out.links).toEqual(['x']);
    expect(out.notes).toBe('n');
    expect(out.title).toBe('New');
    expect(out.fields).toHaveLength(3);
    expect(out.fields[0]).toEqual(raw.fields[0]);
    expect(out.fields[1]).toEqual({ id: 'f2', label: 'Password', kind: 'secret', value: 'new' });
    expect(out.fields[2]).toMatchObject({ label: 'Port', kind: 'mono', value: '22' });
    expect(out.fields[2].id).toMatch(/^[0-9a-z]{8}$/);
    expect(raw.fields[1].value).toBe('old'); // input not mutated
  });
  it('validates kind and status', () => {
    expect(() => mergePayload(raw, { setFields: [{ label: 'x', kind: 'bogus', value: '' }] })).toThrow(/kind/);
    expect(() => mergePayload(raw, { status: 'deleted' })).toThrow(/status/);
    expect(() => mergePayload(raw, { removeFields: ['nope'] })).toThrow(/no field/);
  });
  it('buildPayload validates kinds and fills the full shape', () => {
    const p = buildPayload({ title: ' T ', fields: [{ label: 'Key', kind: 'secret', value: 'v' }], tags: ['a', 'a', ' b'] });
    expect(p).toMatchObject({ v: 1, title: 'T', tags: ['a', 'b'], status: 'active', supersededBy: null, links: [], attachments: [], favorite: false });
    expect(() => buildPayload({ title: 'T', fields: [{ label: 'K', kind: 'password', value: '' }] })).toThrow(/kind/);
  });
});

describe('argument parsing', () => {
  it('handles value flags and booleans', () => {
    expect(parseArgs(['ls', 'db', '--type', 'database', '--project=DEMO', '--json'])).toEqual({ pos: ['ls', 'db'], flags: { type: 'database', project: 'DEMO', json: true } });
  });
});
