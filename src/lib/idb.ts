import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ClientData, PendingSyncItem } from '../types';

interface ClientesProDB extends DBSchema {
  cached_clients: {
    key: string;
    value: ClientData;
    indexes: { 'by-seller': string; 'by-cedula': string; 'by-syncStatus': string };
  };
  pending_sync: {
    key: string;
    value: PendingSyncItem;
    indexes: { 'by-timestamp': number };
  };
}

const DB_NAME = 'clientes_pro_offline_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ClientesProDB>> | null = null;

function getDb(): Promise<IDBPDatabase<ClientesProDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ClientesProDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Cache for all clients to allow offline browsing
        if (!db.objectStoreNames.contains('cached_clients')) {
          const clientStore = db.createObjectStore('cached_clients', { keyPath: 'clientId' });
          clientStore.createIndex('by-seller', 'sellerId');
          clientStore.createIndex('by-cedula', 'cedula');
          clientStore.createIndex('by-syncStatus', 'syncStatus');
        }

        // Pending sync queue for offline registrations & updates
        if (!db.objectStoreNames.contains('pending_sync')) {
          const syncStore = db.createObjectStore('pending_sync', { keyPath: 'id' });
          syncStore.createIndex('by-timestamp', 'timestamp');
        }
      },
    });
  }
  return dbPromise;
}

// Client Cache Operations
export async function cacheClientsLocally(clients: ClientData[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('cached_clients', 'readwrite');
  for (const client of clients) {
    await tx.store.put(client);
  }
  await tx.done;
}

export async function saveCachedClient(client: ClientData): Promise<void> {
  const db = await getDb();
  await db.put('cached_clients', client);
}

export async function getCachedClients(): Promise<ClientData[]> {
  const db = await getDb();
  return db.getAll('cached_clients');
}

export async function getCachedClientById(clientId: string): Promise<ClientData | undefined> {
  const db = await getDb();
  return db.get('cached_clients', clientId);
}

export async function deleteCachedClient(clientId: string): Promise<void> {
  const db = await getDb();
  await db.delete('cached_clients', clientId);
}

// Pending Sync Operations
export async function savePendingSync(item: PendingSyncItem): Promise<void> {
  const db = await getDb();
  await db.put('pending_sync', item);
  // Also put into local cached clients with 'pending' status so the seller sees it instantly
  await db.put('cached_clients', item.clientData);
}

export async function getPendingSyncItems(): Promise<PendingSyncItem[]> {
  const db = await getDb();
  return db.getAllFromIndex('pending_sync', 'by-timestamp');
}

export async function removePendingSyncItem(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('pending_sync', id);
}

export async function countPendingSync(): Promise<number> {
  const db = await getDb();
  return db.count('pending_sync');
}

export async function clearAllLocalCache(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['cached_clients', 'pending_sync'], 'readwrite');
  await tx.objectStore('cached_clients').clear();
  await tx.objectStore('pending_sync').clear();
  await tx.done;
}
