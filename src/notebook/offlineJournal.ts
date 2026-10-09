export interface NotebookJournal {
  key: string; pageId: number; teamId: number; memberId: number;
  epoch: string; state: string; pending: boolean;
  title: string; revision: number; editable: boolean; updatedBy: number | null; updatedAt: string;
}
const DATABASE = 'cp-notebook';
let opening: Promise<IDBDatabase> | undefined;
const writes = new Map<string, Promise<void>>();
function database(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Offline storage is unavailable on this device'));
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('pages', { keyPath: 'key' }); };
    request.onerror = () => { opening = undefined; reject(request.error ?? new Error('Cannot open notebook storage')); };
    request.onblocked = () => { opening = undefined; reject(new Error('Close another notebook tab to update offline storage')); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = undefined; };
      resolve(db);
    };
  });
  return opening;
}
async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', mode);
    const request = run(tx.objectStore('pages'));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () => reject(tx.error ?? request.error ?? new Error('Notebook storage failed; download your unsaved changes'));
  });
}
function serialize(key: string, run: () => Promise<void>) {
  const prior = writes.get(key) ?? Promise.resolve();
  const next = prior.catch(() => {}).then(run); writes.set(key, next);
  void next.then(() => { if (writes.get(key) === next) writes.delete(key); }, () => { if (writes.get(key) === next) writes.delete(key); });
  return next;
}
export async function readNotebookJournal(key: string): Promise<NotebookJournal | undefined> {
  await writes.get(key)?.catch(() => {});
  return transaction('readonly', store => store.get(key));
}
export function writeNotebookJournal(value: NotebookJournal): Promise<void> {
  // Callers can only journal ordinary pages. There is deliberately no protected
  // field/override that would let a different call site cache protected data.
  return serialize(value.key, async () => { await transaction('readwrite', store => store.put(value)); });
}
export function deleteNotebookJournal(key: string): Promise<void> {
  return serialize(key, async () => { await transaction('readwrite', store => store.delete(key)); });
}
export async function pendingNotebookJournals(): Promise<NotebookJournal[]> {
  await Promise.allSettled([...writes.values()]);
  const entries = await transaction<NotebookJournal[]>('readonly', store => store.getAll());
  return entries.filter(entry => entry.pending);
}
export async function clearNotebookJournals(): Promise<void> {
  await Promise.allSettled([...writes.values()]);
  await transaction('readwrite', store => store.clear());
}
