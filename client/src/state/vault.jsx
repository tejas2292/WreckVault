// Vault state (spec §5): decrypted items and collections, valid while the session is unlocked.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { errorMessage } from '../lib/api.js';
import { useSession } from './session.jsx';
import { sortItems } from '../lib/itemModel.js';
import { buildExport, parseImport } from '../lib/exportImport.js';
import { downloadJson, dateStamp } from '../lib/download.js';
import {
  loadVault, createItemOp, updateItemOp, trashItemOp, restoreItemOp, deleteForeverOp,
  getHistoryOp, createCollectionOp, personalCollectionId, readFileText, sortCollections,
} from '../lib/vaultCore.js';

const VaultContext = createContext(null);

export function VaultProvider({ children }) {
  const { status } = useSession();
  const [items, setItemsState] = useState([]);
  const [collections, setCollectionsState] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const itemsRef = useRef([]);
  const collectionsRef = useRef([]);
  const loadSeq = useRef(0);

  const setItems = useCallback((next) => {
    itemsRef.current = sortItems(typeof next === 'function' ? next(itemsRef.current) : next);
    setItemsState(itemsRef.current);
  }, []);
  const setCollections = useCallback((next) => {
    collectionsRef.current = next;
    setCollectionsState(next);
  }, []);
  const upsert = useCallback((item) => {
    setItems((list) => (list.some((i) => i.id === item.id) ? list.map((i) => (i.id === item.id ? item : i)) : [...list, item]));
    return item;
  }, [setItems]);

  const refresh = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await loadVault(api);
      if (seq !== loadSeq.current) return;
      setCollections(res.collections);
      setItems(res.items);
    } catch (err) {
      if (seq === loadSeq.current) setError(errorMessage(err, 'Could not load the vault. Try again.'));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [setCollections, setItems]);

  useEffect(() => {
    if (status === 'unlocked') {
      refresh();
    } else {
      loadSeq.current += 1;
      setItems([]);
      setCollections([]);
      setError(null);
      setLoading(false);
    }
  }, [status, refresh, setItems, setCollections]);

  // Mutations throw an Error with a readable message on failure (and set `error`).
  const guard = useCallback(async (fn, fallback) => {
    try {
      return await fn();
    } catch (err) {
      const message = errorMessage(err, fallback);
      setError(message);
      throw new Error(message);
    }
  }, []);

  const find = (id) => itemsRef.current.find((i) => i.id === id);

  const createItem = useCallback((draft) => guard(async () => upsert(
    await createItemOp(api, draft, collectionsRef.current),
  ), 'Could not save the item. Try again.'), [guard, upsert]);

  const updateItem = useCallback((id, draft) => guard(async () => upsert(
    await updateItemOp(api, find(id), draft),
  ), 'Could not save the changes. Try again.'), [guard, upsert]);

  const toggleFavorite = useCallback((id) => guard(async () => {
    const item = find(id);
    return upsert(await updateItemOp(api, item, { favorite: !item?.favorite }));
  }, 'Could not update the favourite. Try again.'), [guard, upsert]);

  const trashItem = useCallback((id) => guard(async () => upsert(
    await trashItemOp(api, find(id) || { id }),
  ), 'Could not move the item to the trash. Try again.'), [guard, upsert]);

  const restoreItem = useCallback((id) => guard(async () => upsert(
    await restoreItemOp(api, find(id) || { id }),
  ), 'Could not restore the item. Try again.'), [guard, upsert]);

  const deleteForever = useCallback((id) => guard(async () => {
    await deleteForeverOp(api, id);
    setItems((list) => list.filter((i) => i.id !== id));
  }, 'Could not delete the item. Try again.'), [guard, setItems]);

  const getHistory = useCallback((id) => guard(async () => {
    const item = find(id);
    if (!item) throw new Error('That item no longer exists.');
    return getHistoryOp(api, item);
  }, 'Could not load the history. Try again.'), [guard]);

  const restoreVersion = useCallback((id, historyId) => guard(async () => {
    const item = find(id);
    if (!item) throw new Error('That item no longer exists.');
    const versions = await getHistoryOp(api, item);
    const v = versions.find((h) => h.historyId === historyId);
    if (!v) throw new Error('That version no longer exists.');
    if (v.item.decryptError) throw new Error('That version could not be decrypted, so it cannot be restored.');
    const draft = { ...v.item };
    for (const k of ['id', 'createdAt', 'updatedAt', 'deletedAt', 'legacyEntryId']) delete draft[k];
    return upsert(await updateItemOp(api, item, draft));
  }, 'Could not restore that version. Try again.'), [guard, upsert]);

  const createCollection = useCallback((name) => guard(async () => {
    const c = await createCollectionOp(api, name);
    setCollections(sortCollections([...collectionsRef.current, c]));
    return c;
  }, 'Could not create the collection. Try again.'), [guard, setCollections]);

  const exportVault = useCallback(() => {
    const filename = `wreckvault-export-${dateStamp()}.json`;
    downloadJson(filename, buildExport(itemsRef.current));
    return filename;
  }, []);

  const importFile = useCallback((file) => guard(async () => {
    const text = await readFileText(file);
    const { format, drafts, skipped } = parseImport(text, file?.name || '');
    const collectionId = personalCollectionId(collectionsRef.current);
    let imported = 0;
    let failed = 0;
    for (const d of drafts) {
      const { deletedAt, ...draft } = d;
      try {
        let item = upsert(await createItemOp(api, { ...draft, collectionId }, collectionsRef.current));
        if (deletedAt) item = upsert(await trashItemOp(api, item));
        imported += 1;
      } catch {
        failed += 1;
      }
    }
    return { imported, skipped: skipped + failed, format };
  }, 'Could not import the file. Try again.'), [guard, upsert]);

  const value = useMemo(() => ({
    items, collections, loading, error,
    createItem, updateItem, toggleFavorite, trashItem, restoreItem, deleteForever,
    getHistory, restoreVersion, exportVault, importFile, refresh, createCollection,
  }), [items, collections, loading, error, createItem, updateItem, toggleFavorite, trashItem,
    restoreItem, deleteForever, getHistory, restoreVersion, exportVault, importFile, refresh, createCollection]);

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used inside <VaultProvider>.');
  return ctx;
}
