// ─── FORGE IndexedDB Utility ───
const DB_NAME = 'ForgeDB';
const DB_VERSION = 1;

const STORES = {
  plans:       { keyPath: 'id' },
  logs:        { keyPath: 'id' },
  nutrition:   { keyPath: 'id' },
  bodyweight:  { keyPath: 'id' },
  customFoods: { keyPath: 'id' },
  settings:    { keyPath: 'key' },
  prs:         { keyPath: 'id' }
};

let _db = null;

async function openDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      Object.entries(STORES).forEach(([name, opts]) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, opts);
        }
      });
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbGet(store, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

async function dbGetAll(store) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

async function dbPut(store, value) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

async function dbDelete(store, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}

async function getSetting(key, defaultVal = null) {
  const r = await dbGet('settings', key);
  return r ? r.value : defaultVal;
}
async function setSetting(key, value) {
  await dbPut('settings', { key, value });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

window.DB = { openDB, dbGet, dbGetAll, dbPut, dbDelete, getSetting, setSetting, uid };
