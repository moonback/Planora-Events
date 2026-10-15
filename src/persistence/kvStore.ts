/** Stockage clé/valeur minimal ; `update` est atomique (lecture + écriture dans une même transaction). */
export interface KVStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  /** Valeurs dont la clé commence par `prefix`. */
  list<T>(prefix: string): Promise<T[]>;
  update<T>(key: string, fn: (current: T | undefined) => T): Promise<T>;
}

export class MemoryKVStore implements KVStore {
  private readonly data = new Map<string, unknown>();
  /** Permet aux tests de simuler une panne de stockage. */
  failNextWrite: Error | null = null;

  private checkFail() {
    const e = this.failNextWrite;
    this.failNextWrite = null;
    if (e) throw e;
  }
  async get<T>(key: string) {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async set<T>(key: string, value: T) {
    this.checkFail();
    this.data.set(key, structuredClone(value));
  }
  async delete(key: string) {
    this.checkFail();
    this.data.delete(key);
  }
  async list<T>(prefix: string) {
    return [...this.data.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v) as T);
  }
  async update<T>(key: string, fn: (current: T | undefined) => T) {
    const next = fn(structuredClone(this.data.get(key)) as T | undefined);
    this.checkFail();
    this.data.set(key, structuredClone(next));
    return next;
  }
}

const STORE = 'kv';

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('Erreur IndexedDB'));
  });

export class IndexedDBKVStore implements KVStore {
  private readonly db: Promise<IDBDatabase>;

  constructor(name = 'planora-events') {
    this.db = new Promise((resolve, reject) => {
      const open = indexedDB.open(name, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error("Impossible d'ouvrir la base locale (IndexedDB)."));
    });
  }

  private async tx(mode: IDBTransactionMode) {
    return (await this.db).transaction(STORE, mode).objectStore(STORE);
  }
  async get<T>(key: string) {
    return req<T | undefined>((await this.tx('readonly')).get(key));
  }
  async set<T>(key: string, value: T) {
    await req((await this.tx('readwrite')).put(value, key));
  }
  async delete(key: string) {
    await req((await this.tx('readwrite')).delete(key));
  }
  async list<T>(prefix: string) {
    return req<T[]>((await this.tx('readonly')).getAll(IDBKeyRange.bound(prefix, `${prefix}￿`)));
  }
  async update<T>(key: string, fn: (current: T | undefined) => T) {
    const store = await this.tx('readwrite');
    return new Promise<T>((resolve, reject) => {
      const t = store.transaction;
      let result: T;
      const g = store.get(key);
      g.onsuccess = () => {
        try {
          result = fn(g.result as T | undefined);
          store.put(result, key);
        } catch (e) {
          t.abort();
          reject(e);
        }
      };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error ?? new Error('Erreur IndexedDB'));
    });
  }
}
