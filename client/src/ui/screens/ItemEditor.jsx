import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, Download, Eye, EyeOff, File, Loader2, Paperclip, Plus, Trash2, Wand2, X,
} from 'lucide-react';
import { FIELD_KINDS, ITEM_STATUSES, ITEM_TYPES, TYPE_KEYS } from '../../lib/itemTypes.js';
import { MAX_ATTACHMENT_BYTES, blankItem, newAttachmentId, newFieldId, validateDraft } from '../../lib/itemModel.js';
import { useVault } from '../../state/vault.jsx';
import Dialog from '../components/Dialog.jsx';
import Icon from '../components/Icon.jsx';
import { TypeIcon } from '../components/Tile.jsx';
import StrengthBar from '../components/StrengthBar.jsx';
import { useConfirm } from '../context/confirm.jsx';
import { useToast } from '../context/toast.jsx';
import { quickSecret } from '../lib/generator.js';
import { fmtBytes, isPasswordField, searchText, typeLabel } from '../lib/format.js';
import { downloadAttachment, readAttachment } from '../lib/files.js';

const KIND_KEYS = Object.keys(FIELD_KINDS);
const STATUS_LABEL = { active: 'Active', superseded: 'Superseded', revoked: 'Revoked' };
const kindLabel = (k) => FIELD_KINDS[k]?.label || k;
const defaultLabelFor = (k) => kindLabel(k).replace(/\s*\(.*\)$/, '');

// Pick the type of a new item.
export function TypePicker({ onPick, onClose }) {
  return (
    <Dialog title="New item" onClose={onClose} size="lg">
      <div className="types">
        {TYPE_KEYS.map((k) => (
          <button type="button" key={k} className="type-b" onClick={() => onPick(k)}>
            <span className="tile">
              <TypeIcon type={k} />
            </span>
            <b>{ITEM_TYPES[k].label}</b>
            <small>{ITEM_TYPES[k].blurb}</small>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function toDraft(src) {
  return {
    type: src.type,
    collectionId: src.collectionId,
    title: src.title || '',
    fields: (src.fields || []).map((f) => ({ id: f.id || newFieldId(), label: f.label || '', kind: f.kind || 'text', value: f.value ?? '' })),
    notes: src.notes || '',
    tags: [...(src.tags || [])],
    project: src.project || '',
    favorite: !!src.favorite,
    status: src.status || 'active',
    supersededBy: src.supersededBy || null,
    links: [...(src.links || [])],
    attachments: (src.attachments || []).map((a) => ({ ...a })),
  };
}

function TagInput({ id, tags, onChange }) {
  const [text, setText] = useState('');
  const add = (raw) => {
    const parts = raw.split(',').map((t) => t.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange([...new Set([...tags, ...parts])]);
    setText('');
  };
  return (
    <div className="inp tags">
      {tags.map((t) => (
        <span key={t} className="chip c-mute">
          {t}
          <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`}>
            <Icon icon={X} size={12} />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        placeholder={tags.length ? '' : 'Type a tag, then Enter'}
        onChange={(e) => {
          if (e.target.value.includes(',')) add(e.target.value);
          else setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => add(text)}
        autoCapitalize="none"
        spellCheck={false}
      />
    </div>
  );
}

function LinkPicker({ id, links, onChange, candidates, itemsById }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return candidates.filter((c) => !links.includes(c.id) && terms.every((t) => searchText(c).includes(t))).slice(0, 8);
  }, [q, candidates, links]);

  const add = (itemId) => {
    onChange([...links, itemId]);
    setQ('');
  };

  return (
    <div className="fld">
      {links.length > 0 && (
        <div className="links">
          {links.map((lid) => {
            const l = itemsById.get(lid);
            return (
              <span key={lid} className={`link-i ${l ? '' : 'missing'}`}>
                {l && <TypeIcon type={l.type} />}
                <span>{l ? l.title : 'Deleted item'}</span>
                <button type="button" className="ib" onClick={() => onChange(links.filter((x) => x !== lid))} aria-label={`Unlink ${l ? l.title : 'deleted item'}`}>
                  <Icon icon={X} size={14} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div
        className="picker"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
        }}
      >
        <input
          id={id}
          className="inp"
          value={q}
          placeholder="Search for an item to link"
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (matches[0]) add(matches[0].id);
            } else if (e.key === 'Escape' && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          autoComplete="off"
        />
        {open && q.trim() && (
          <div className="picker-l">
            {matches.length ? (
              matches.map((m) => (
                <button type="button" key={m.id} className="pal-i" onClick={() => add(m.id)}>
                  <TypeIcon type={m.type} />
                  <span className="it-b">
                    <span className="it-t">{m.title}</span>
                  </span>
                  <span className="k">{typeLabel(m.type)}</span>
                </button>
              ))
            ) : (
              <div className="empty">No items match.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ValueInput({ field, onValue, revealed, onReveal, onGenerate }) {
  const common = {
    id: `fv-${field.id}`,
    value: field.value,
    onChange: (e) => onValue(e.target.value),
    'aria-label': `${field.label || 'Field'} value`,
    autoComplete: 'off',
    autoCapitalize: 'none',
    spellCheck: false,
  };
  switch (field.kind) {
    case 'secret':
      return (
        <div className="inp inp-wrap">
          <input {...common} type={revealed ? 'text' : 'password'} className="mono" autoComplete="new-password" />
          <button type="button" className="ib" onClick={onReveal} aria-label={revealed ? `Hide ${field.label}` : `Show ${field.label}`} aria-pressed={revealed}>
            <Icon icon={revealed ? EyeOff : Eye} />
          </button>
          <button type="button" className="ib" onClick={onGenerate} aria-label={`Generate a new ${field.label || 'secret'}`} title="Generate">
            <Icon icon={Wand2} />
          </button>
        </div>
      );
    case 'multi':
      return <textarea {...common} className="inp mono" rows={4} />;
    case 'date':
      return <input {...common} type="date" className="inp" />;
    case 'totp':
      return <input {...common} className="inp mono" placeholder="Base32 secret or otpauth:// link" />;
    case 'url':
      return <input {...common} type="url" inputMode="url" className="inp" placeholder="https://example.com" />;
    case 'mono':
    case 'ref':
      return <input {...common} className="inp mono" />;
    default:
      return <input {...common} className="inp" autoCapitalize="sentences" spellCheck />;
  }
}

// Create and edit items. `item` is set when editing; `type` when creating.
export default function ItemEditor({ item, type, defaultCollectionId, onClose, onSaved }) {
  const { items, collections, createItem, updateItem } = useVault();
  const confirm = useConfirm();
  const toast = useToast();
  const editing = !!item;
  const usable = collections.filter((c) => !c.keyError);

  const [draft, setDraft] = useState(() => {
    if (item) return toDraft(item);
    const cid = usable.find((c) => c.id === defaultCollectionId)?.id || usable.find((c) => c.kind === 'personal')?.id || usable[0]?.id || null;
    return toDraft(blankItem(type, cid));
  });
  const initial = useRef(JSON.stringify(draft));
  const [revealed, setRevealed] = useState(() => new Set());
  const [newKind, setNewKind] = useState('text');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const focusField = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!focusField.current) return;
    const el = document.getElementById(`fl-${focusField.current}`);
    focusField.current = null;
    el?.focus();
    el?.select();
  });

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setField = (fid, patch) => setDraft((d) => ({ ...d, fields: d.fields.map((f) => (f.id === fid ? { ...f, ...patch } : f)) }));
  const moveField = (i, dir) =>
    setDraft((d) => {
      const fields = [...d.fields];
      const j = i + dir;
      if (j < 0 || j >= fields.length) return d;
      [fields[i], fields[j]] = [fields[j], fields[i]];
      return { ...d, fields };
    });
  const removeField = (fid) => setDraft((d) => ({ ...d, fields: d.fields.filter((f) => f.id !== fid) }));
  const addField = () => {
    const id = newFieldId();
    focusField.current = id;
    setDraft((d) => ({ ...d, fields: [...d.fields, { id, label: defaultLabelFor(newKind), kind: newKind, value: '' }] }));
  };
  const toggleReveal = (fid) =>
    setRevealed((s) => {
      const n = new Set(s);
      if (n.has(fid)) n.delete(fid);
      else n.add(fid);
      return n;
    });

  // Changing type keeps filled-in fields and adds the new template's missing ones.
  const changeType = (t) =>
    setDraft((d) => {
      const kept = d.fields.filter((f) => String(f.value).trim() !== '');
      const labels = new Set(kept.map((f) => f.label.toLowerCase()));
      const extra = ITEM_TYPES[t].template
        .filter(([label]) => !labels.has(label.toLowerCase()))
        .map(([label, kind]) => ({ id: newFieldId(), label, kind, value: '' }));
      return { ...d, type: t, fields: [...kept, ...extra] };
    });

  const projects = useMemo(() => [...new Set(items.filter((i) => !i.deletedAt && i.project).map((i) => i.project))].sort(), [items]);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const candidates = useMemo(
    () => items.filter((i) => !i.deletedAt && !i.decryptError && i.id !== item?.id),
    [items, item],
  );

  const addFiles = async (fileList) => {
    const files = [...(fileList || [])];
    for (const f of files) {
      if (f.size > MAX_ATTACHMENT_BYTES) {
        toast(`${f.name} is ${fmtBytes(f.size)}. Files can be at most 1 MB; attach a smaller file.`, { tone: 'bad' });
        continue;
      }
      try {
        const a = await readAttachment(f);
        setDraft((d) => ({ ...d, attachments: [...d.attachments, { id: newAttachmentId(), ...a }] }));
      } catch (err) {
        toast(err.message, { tone: 'bad' });
      }
    }
  };

  const requestClose = async () => {
    if (saving) return;
    if (JSON.stringify(draft) !== initial.current) {
      const ok = await confirm({
        title: 'Discard your changes?',
        message: editing ? 'The item keeps its saved version.' : 'The new item will not be saved.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        danger: true,
      });
      if (!ok) return;
    }
    onClose();
  };

  const save = async (e) => {
    e?.preventDefault();
    if (saving) return;
    const clean = {
      ...draft,
      title: draft.title.trim(),
      project: draft.project.trim(),
      fields: draft.fields.filter((f) => String(f.value).trim() !== '').map((f) => ({ ...f, label: f.label.trim() || defaultLabelFor(f.kind) })),
      supersededBy: draft.status === 'superseded' ? draft.supersededBy || null : null,
    };
    if (!clean.collectionId) return setError('Choose a collection.');
    const problem = validateDraft(clean);
    if (problem) {
      setError(problem);
      if (!clean.title) document.getElementById('ed-title')?.focus();
      return;
    }
    setError('');
    setSaving(true);
    try {
      const saved = editing ? await updateItem(item.id, clean) : await createItem(clean);
      toast(editing ? 'Changes saved.' : 'Item saved.');
      onSaved(saved);
    } catch (err) {
      setError(err.message || 'Could not save the item. Try again.');
      setSaving(false);
    }
  };

  const supersedeOptions = candidates.filter((c) => !c.deletedAt);

  return (
    <Dialog
      as="form"
      onSubmit={save}
      size="lg"
      title={editing ? `Edit ${draft.title || typeLabel(draft.type).toLowerCase()}` : `New ${typeLabel(draft.type).toLowerCase()}`}
      icon={
        <span className="tile">
          <TypeIcon type={draft.type} />
        </span>
      }
      onClose={requestClose}
      footer={
        <>
          {error && (
            <span className="err grow" role="alert">
              {error}
            </span>
          )}
          <button type="button" className="btn btn-sec" onClick={requestClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-pri" disabled={saving}>
            {saving ? (
              <>
                <Icon icon={Loader2} className="spin" /> Saving…
              </>
            ) : editing ? (
              'Save changes'
            ) : (
              'Save item'
            )}
          </button>
        </>
      }
    >
      <div className="fld">
        <label htmlFor="ed-title">Title</label>
        <input
          id="ed-title"
          className="inp"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder={draft.type === 'api_key' ? 'Example: Mapbox public token' : `${typeLabel(draft.type)} name`}
          data-autofocus
          autoComplete="off"
        />
      </div>

      <div className="two">
        <div className="fld">
          <label htmlFor="ed-type">Type</label>
          <select id="ed-type" className="inp" value={draft.type} onChange={(e) => changeType(e.target.value)}>
            {TYPE_KEYS.map((k) => (
              <option key={k} value={k}>
                {ITEM_TYPES[k].label}
              </option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="ed-coll">Collection</label>
          <select id="ed-coll" className="inp" value={draft.collectionId || ''} onChange={(e) => set({ collectionId: e.target.value })}>
            {!draft.collectionId && <option value="">Choose a collection</option>}
            {usable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.agentAccess ? ' (Claude can read)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="two">
        <div className="fld">
          <label htmlFor="ed-project">Project</label>
          <input
            id="ed-project"
            className="inp"
            list="ed-projects"
            value={draft.project}
            onChange={(e) => set({ project: e.target.value })}
            placeholder="Example: HOME_LAB"
            autoComplete="off"
          />
          <datalist id="ed-projects">
            {projects.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className="fld">
          <label htmlFor="ed-tags">Tags</label>
          <TagInput id="ed-tags" tags={draft.tags} onChange={(tags) => set({ tags })} />
        </div>
      </div>

      <label className="check">
        <input type="checkbox" checked={draft.favorite} onChange={(e) => set({ favorite: e.target.checked })} />
        Favourite
      </label>

      <div className="ed-split" />

      <div className="fld">
        <span className="lbl" id="ed-fields-l">
          Fields
        </span>
        <div className="ed-fields" role="group" aria-labelledby="ed-fields-l">
          {draft.fields.length === 0 && <p className="quiet">No fields yet. Add one below.</p>}
          {draft.fields.map((f, i) => (
            <div className="frow" key={f.id}>
              <input
                id={`fl-${f.id}`}
                className="inp"
                value={f.label}
                onChange={(e) => setField(f.id, { label: e.target.value })}
                aria-label={`Field ${i + 1} label`}
                placeholder="Label"
                autoComplete="off"
              />
              <select className="inp" value={f.kind} onChange={(e) => setField(f.id, { kind: e.target.value })} aria-label={`Field ${i + 1} kind`}>
                {KIND_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {kindLabel(k)}
                  </option>
                ))}
              </select>
              <div className="val">
                <ValueInput
                  field={f}
                  onValue={(value) => setField(f.id, { value })}
                  revealed={revealed.has(f.id)}
                  onReveal={() => toggleReveal(f.id)}
                  onGenerate={() => {
                    setField(f.id, { value: quickSecret() });
                    setRevealed((s) => new Set(s).add(f.id));
                  }}
                />
                {isPasswordField(f) && <StrengthBar password={f.value} />}
              </div>
              <div className="frow-acts">
                <button type="button" className="ib" onClick={() => moveField(i, -1)} disabled={i === 0} aria-label={`Move ${f.label || 'field'} up`}>
                  <Icon icon={ArrowUp} />
                </button>
                <button
                  type="button"
                  className="ib"
                  onClick={() => moveField(i, 1)}
                  disabled={i === draft.fields.length - 1}
                  aria-label={`Move ${f.label || 'field'} down`}
                >
                  <Icon icon={ArrowDown} />
                </button>
                <button type="button" className="ib" onClick={() => removeField(f.id)} aria-label={`Remove ${f.label || 'field'}`}>
                  <Icon icon={Trash2} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="row">
          <select className="inp" style={{ width: 'auto' }} value={newKind} onChange={(e) => setNewKind(e.target.value)} aria-label="Kind of field to add">
            {KIND_KEYS.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-sec" onClick={addField}>
            <Icon icon={Plus} /> Add field
          </button>
        </div>
        <span className="hint">Fields left empty are not saved.</span>
      </div>

      <div className="fld">
        <label htmlFor="ed-notes">Notes</label>
        <textarea id="ed-notes" className="inp" rows={3} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>

      <div className="fld">
        <span className="lbl">Files</span>
        {draft.attachments.length > 0 && (
          <div className="ed-att">
            {draft.attachments.map((a) => (
              <div className="ed-att-r" key={a.id}>
                <Icon icon={File} />
                <span>{a.name}</span>
                <small>{fmtBytes(a.size)}</small>
                <button type="button" className="ib" onClick={() => downloadAttachment(a)} aria-label={`Download ${a.name}`}>
                  <Icon icon={Download} />
                </button>
                <button
                  type="button"
                  className="ib"
                  onClick={() => set({ attachments: draft.attachments.filter((x) => x.id !== a.id) })}
                  aria-label={`Remove ${a.name}`}
                >
                  <Icon icon={Trash2} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="row">
          <button type="button" className="btn btn-sec" onClick={() => fileRef.current?.click()}>
            <Icon icon={Paperclip} /> Attach files
          </button>
          <span className="hint">Up to 1 MB each, encrypted with the item.</span>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <div className="fld">
        <label htmlFor="ed-links">Linked items</label>
        <LinkPicker id="ed-links" links={draft.links} onChange={(links) => set({ links })} candidates={candidates} itemsById={itemsById} />
      </div>

      <div className="two">
        <div className="fld">
          <label htmlFor="ed-status">Status</label>
          <select id="ed-status" className="inp" value={draft.status} onChange={(e) => set({ status: e.target.value })}>
            {ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s] || s}
              </option>
            ))}
          </select>
        </div>
        {draft.status === 'superseded' && (
          <div className="fld">
            <label htmlFor="ed-sup">Superseded by</label>
            <select id="ed-sup" className="inp" value={draft.supersededBy || ''} onChange={(e) => set({ supersededBy: e.target.value || null })}>
              <option value="">Not set</option>
              {supersedeOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({typeLabel(c.type)})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </Dialog>
  );
}
