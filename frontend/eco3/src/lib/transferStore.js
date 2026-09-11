const DB_NAME = 'eco3';
const DB_VERSION = 1;
const STORE = 'transfers';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('peerId', 'peerId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    }

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  })

  return dbPromise;
}

const recordKey = (transferId, peerId) => `${transferId}:${peerId}`;

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function saveTransfer(record) {
  const db = await openDB();
  const full = {
    ...record,
    key: recordKey(record.transferId, record.peerId),
    lastActiveAt: Date.now(),
  }

  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').put(full);
    req.onsuccess = () => resolve(full);
    req.onerror = () => reject(req.error);
  })

}

// Read and write in one transaction, so concurrent patches can't overwrite each other.
export async function patchTransfer(transferId, peerId, patch) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, 'readwrite');
    const req = store.get(recordKey(transferId, peerId));
    req.onsuccess = () => {
      if (!req.result) return resolve(null);
      const full = { ...req.result, ...patch, lastActiveAt: Date.now() };
      const put = store.put(full);
      put.onsuccess = () => resolve(full);
      put.onerror = () => reject(put.error);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function loadTransfer(transferId, peerId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').get(recordKey(transferId, peerId))
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  })
}

export async function listTransfers(peerId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, 'readonly');
    const req = peerId ? store.index('peerId').getAll(peerId) : store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  })
}

export async function listPending() {
  const all = await listTransfers();
  return all.filter((r) => r.status !== 'complete');
}

export async function deleteTransfer(transferId, peerId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').delete(recordKey(transferId, peerId));
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  })
}

export async function pruneOld(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
  const all = await listTransfers();
  const cutoff = Date.now() - maxAgeMs;
  const stale = all.filter((r) => r.lastActiveAt < cutoff);
  await Promise.all(stale.map((r) => deleteTransfer(r.transferId, r.peerId)))
}



