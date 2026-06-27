/* ═══════════════════════════════════════
   db.js — IndexedDB: збереження і читання
   Nodly
════════════════════════════════════════ */

const DB = (() => {

  const DB_NAME    = 'nodly-db';
  const DB_VERSION = 1;
  const STORE      = 'calculators';

  let _db = null;

  /* ── Відкрити / створити базу ── */
  function open() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };

      req.onsuccess = (e) => {
        _db = e.target.result;
        resolve(_db);
      };

      req.onerror = (e) => {
        console.error('[DB] Помилка відкриття:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  /* ── Зберегти калькулятор ── */
  async function save(calc) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(calc);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => {
        console.error('[DB] Помилка збереження:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  /* ── Отримати всі калькулятори ── */
  async function getAll() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror   = (e) => {
        console.error('[DB] Помилка читання:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  /* ── Отримати один калькулятор по id ── */
  async function getById(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror   = (e) => {
        console.error('[DB] Помилка читання:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  /* ── Видалити калькулятор ── */
  async function remove(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => {
        console.error('[DB] Помилка видалення:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  /* ── Зберегти масив калькуляторів (для імпорту) ── */
  async function saveMany(calcs) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      calcs.forEach(c => store.put(c));
      tx.oncomplete = () => resolve();
      tx.onerror    = (e) => {
        console.error('[DB] Помилка масового збереження:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  /* ── Публічний API ── */
  return { open, save, getAll, getById, remove, saveMany };

})();
