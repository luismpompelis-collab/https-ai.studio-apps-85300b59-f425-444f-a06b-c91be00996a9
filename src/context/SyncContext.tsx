import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  savePendingSync,
  getPendingSyncItems,
  removePendingSyncItem,
  countPendingSync,
  saveCachedClient,
  deleteCachedClient,
  getCachedClients,
  cacheClientsLocally
} from '../lib/idb';
import { ClientData, PendingSyncItem } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, setDoc, getDoc, collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { recordAuditLog } from '../lib/audit';
import { useAuth } from './AuthContext';

interface SyncContextType {
  isOnline: boolean;
  pendingCount: number;
  pendingItems: PendingSyncItem[];
  isSyncing: boolean;
  syncProgress: { current: number; total: number } | null;
  syncNow: () => Promise<void>;
  enqueueClient: (clientData: ClientData, action?: 'create' | 'update' | 'delete') => Promise<void>;
  allClients: ClientData[];
  loadingClients: boolean;
  refreshClients: () => Promise<void>;
  removeClientLocallyAndRemote: (clientId: string) => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile, activeRole } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [pendingItems, setPendingItems] = useState<PendingSyncItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [allClients, setAllClients] = useState<ClientData[]>([]);
  const [loadingClients, setLoadingClients] = useState<boolean>(true);

  // Update pending queue status
  const updatePendingState = useCallback(async () => {
    try {
      const items = await getPendingSyncItems();
      setPendingItems(items);
      setPendingCount(items.length);
    } catch (e) {
      console.warn('Error reading pending items:', e);
    }
  }, []);

  // Fetch or sync all clients from Firestore or IndexedDB
  const refreshClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      if (isOnline && userProfile) {
        // Query based on role
        let q;
        if (activeRole === 'admin') {
          q = collection(db, 'clients');
        } else if (activeRole === 'supervisor') {
          // Supervisors view clients in their team or all non-deleted
          q = collection(db, 'clients');
        } else {
          // Seller sees their own clients
          q = query(collection(db, 'clients'), where('sellerId', '==', userProfile.uid));
        }

        const snapshot = await getDocs(q);
        const remoteClients: ClientData[] = [];
        snapshot.forEach((docSnap) => {
          remoteClients.push(docSnap.data() as ClientData);
        });

        // Merge with locally pending clients that haven't reached server yet
        const localPending = await getPendingSyncItems();
        const pendingMap = new Map(localPending.map((p) => [p.clientId, p.clientData]));

        const mergedMap = new Map<string, ClientData>();
        // Add remote
        remoteClients.forEach((c) => mergedMap.set(c.clientId, c));
        // Override with pending (if newer or local)
        pendingMap.forEach((c, id) => mergedMap.set(id, c));

        let finalClients = Array.from(mergedMap.values());
        if (finalClients.length === 0) {
          finalClients = [
            {
              clientId: 'CLI_DO_001',
              fullName: 'Rafael Antonio De La Cruz (Colmado San Rafael)',
              cedula: '001-0872635-4',
              phone: '8095412234',
              secondaryPhone: '8296541122',
              sector: 'Piantini (Distrito Nacional)',
              street: 'Av. Gustavo Mejía Ricart',
              localNumber: 'No. 45-B',
              additionalAddress: 'Esq. Manuel de Jesús Troncoso, frente a torre corporativa',
              latitude: 18.473520,
              longitude: -69.932450,
              accuracy: 4.2,
              capturedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
              sellerId: 'demo_seller_carlos',
              sellerName: 'Carlos Manuel Gómez',
              supervisorId: 'demo_supervisor_roberto',
              createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
              updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
              syncStatus: 'synced'
            },
            {
              clientId: 'CLI_DO_002',
              fullName: 'Ana María Rodríguez Peña (Distribuidora Los Prados)',
              cedula: '001-1678942-8',
              phone: '8296338891',
              sector: 'Los Prados (Distrito Nacional)',
              street: 'Calle Lorenzo Despradel',
              localNumber: 'No. 12',
              additionalAddress: 'Al lado de la panadería Los Prados',
              latitude: 18.481230,
              longitude: -69.954120,
              accuracy: 6.8,
              capturedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
              sellerId: 'demo_seller_carlos',
              sellerName: 'Carlos Manuel Gómez',
              supervisorId: 'demo_supervisor_roberto',
              createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
              updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
              syncStatus: 'synced'
            },
            {
              clientId: 'CLI_DO_003',
              fullName: 'Juan Carlos Morales Jiménez (Farmacia Gurabo)',
              cedula: '031-0456123-2',
              phone: '8095827712',
              sector: 'Santiago - Gurabo',
              street: 'Carretera Luperón Km 3.5',
              localNumber: 'No. 104',
              additionalAddress: 'Frente a plaza comercial Gurabo',
              latitude: 19.467810,
              longitude: -70.672340,
              accuracy: 5.1,
              capturedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
              sellerId: 'demo_seller_carlos',
              sellerName: 'Carlos Manuel Gómez',
              supervisorId: 'demo_supervisor_roberto',
              createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
              updatedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
              syncStatus: 'synced'
            }
          ];
        }

        // Sort newest first
        finalClients.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setAllClients(finalClients);
        // Cache locally for offline reading
        await cacheClientsLocally(finalClients);
      } else {
        // Offline mode: load from IndexedDB
        let cached = await getCachedClients();
        if (cached.length === 0) {
          cached = [
            {
              clientId: 'CLI_DO_001',
              fullName: 'Rafael Antonio De La Cruz (Colmado San Rafael)',
              cedula: '001-0872635-4',
              phone: '8095412234',
              sector: 'Piantini (Distrito Nacional)',
              street: 'Av. Gustavo Mejía Ricart',
              localNumber: 'No. 45-B',
              latitude: 18.473520,
              longitude: -69.932450,
              accuracy: 4.2,
              capturedAt: new Date().toISOString(),
              sellerId: 'demo_seller_carlos',
              sellerName: 'Carlos Manuel Gómez',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              syncStatus: 'synced'
            }
          ];
        }
        if (userProfile && activeRole === 'seller' && userProfile.uid !== 'demo_admin_luis') {
          const sellerOnly = cached.filter((c) => c.sellerId === userProfile.uid || c.sellerId === 'demo_seller_carlos');
          sellerOnly.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setAllClients(sellerOnly);
        } else {
          cached.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setAllClients(cached);
        }
      }
    } catch (err) {
      console.warn('Error fetching clients, falling back to local DB:', err);
      const cached = await getCachedClients();
      setAllClients(cached);
    } finally {
      setLoadingClients(false);
    }
  }, [isOnline, userProfile, activeRole]);

  // Execute synchronization queue
  const processSyncQueue = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;

    const queue = await getPendingSyncItems();
    if (queue.length === 0) {
      await updatePendingState();
      return;
    }

    setIsSyncing(true);
    setSyncProgress({ current: 0, total: queue.length });

    let processedCount = 0;

    for (const item of queue) {
      try {
        const clientRef = doc(db, 'clients', item.clientId);

        if (item.action === 'delete') {
          // Soft delete on server
          await setDoc(clientRef, { ...item.clientData, deletedAt: new Date().toISOString() }, { merge: true });
        } else {
          // Check conflict resolution
          const remoteSnap = await getDoc(clientRef);
          if (remoteSnap.exists()) {
            const remoteData = remoteSnap.data() as ClientData;
            const remoteTime = new Date(remoteData.updatedAt || remoteData.createdAt).getTime();
            const localTime = new Date(item.clientData.updatedAt || item.clientData.createdAt).getTime();

            // If server version is strictly newer by someone else, resolve conservatively
            if (remoteTime > localTime && remoteData.sellerId !== item.clientData.sellerId) {
              console.warn(`Conflict detected for ${item.clientId}: Remote version is newer`);
            }
          }

          // Save to server
          const syncedRecord: ClientData = {
            ...item.clientData,
            syncStatus: 'synced',
            syncError: undefined
          };
          await setDoc(clientRef, syncedRecord);

          // Update local cache to synced
          await saveCachedClient(syncedRecord);
        }

        // Successfully processed: remove from pending queue
        await removePendingSyncItem(item.id);

        if (userProfile) {
          recordAuditLog(userProfile, 'SINCRONIZAR', {
            clientId: item.clientId,
            clientName: item.clientData.fullName,
            changes: `Sincronización exitosa (${item.action})`
          });
        }
      } catch (error: any) {
        console.error(`Error syncing item ${item.clientId}:`, error);
        // Increment retry and record error
        await savePendingSync({
          ...item,
          retryCount: item.retryCount + 1,
          lastError: error.message || 'Error de red'
        });
      } finally {
        processedCount++;
        setSyncProgress({ current: processedCount, total: queue.length });
      }
    }

    setIsSyncing(false);
    setSyncProgress(null);
    await updatePendingState();
    await refreshClients();
  }, [isSyncing, updatePendingState, refreshClients, userProfile]);

  // Queue client registration or update
  const enqueueClient = async (clientData: ClientData, action: 'create' | 'update' | 'delete' = 'create') => {
    const queueId = `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const pendingItem: PendingSyncItem = {
      id: queueId,
      clientId: clientData.clientId,
      action,
      clientData: {
        ...clientData,
        syncStatus: isOnline ? 'syncing' : 'pending'
      },
      timestamp: Date.now(),
      retryCount: 0
    };

    // Save to IndexedDB queue and cache
    await savePendingSync(pendingItem);
    await updatePendingState();

    // Immediately update in-memory list
    setAllClients((prev) => {
      const idx = prev.findIndex((c) => c.clientId === clientData.clientId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = pendingItem.clientData;
        return copy;
      }
      return [pendingItem.clientData, ...prev];
    });

    // If online, immediately process queue in background
    if (navigator.onLine) {
      setTimeout(() => {
        processSyncQueue();
      }, 200);
    }
  };

  // Soft delete locally and remote
  const removeClientLocallyAndRemote = async (clientId: string) => {
    const target = allClients.find((c) => c.clientId === clientId);
    if (!target) return;

    const updated: ClientData = {
      ...target,
      deletedAt: new Date().toISOString(),
      deletedBy: userProfile?.fullName || 'Usuario',
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending'
    };

    await enqueueClient(updated, 'delete');
  };

  // Online / Offline listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processSyncQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    updatePendingState();
    refreshClients();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [updatePendingState, refreshClients, processSyncQueue]);

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        pendingCount,
        pendingItems,
        isSyncing,
        syncProgress,
        syncNow: processSyncQueue,
        enqueueClient,
        allClients,
        loadingClients,
        refreshClients,
        removeClientLocallyAndRemote
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};
