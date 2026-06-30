// IndexedDB wrapper. Exposes a global `DB` object with promise-based methods.
const DB = (() => {
  const DB_NAME = "lift-db";
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("exercises")) {
          db.createObjectStore("exercises", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("routines")) {
          db.createObjectStore("routines", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("workouts")) {
          db.createObjectStore("workouts", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("kv")) {
          db.createObjectStore("kv", { keyPath: "key" });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
  }

  async function tx(storeName, mode) {
    const db = await open();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    async getAll(store) {
      const os = await tx(store, "readonly");
      return reqToPromise(os.getAll());
    },
    async get(store, key) {
      const os = await tx(store, "readonly");
      return reqToPromise(os.get(key));
    },
    async put(store, value) {
      const os = await tx(store, "readwrite");
      return reqToPromise(os.put(value));
    },
    async delete(store, key) {
      const os = await tx(store, "readwrite");
      return reqToPromise(os.delete(key));
    },
    async clear(store) {
      const os = await tx(store, "readwrite");
      return reqToPromise(os.clear());
    },
    // simple key/value helpers (settings, active workout, etc.)
    async kvGet(key, fallback) {
      const row = await this.get("kv", key);
      return row ? row.value : fallback;
    },
    async kvSet(key, value) {
      return this.put("kv", { key, value });
    },
  };
})();
