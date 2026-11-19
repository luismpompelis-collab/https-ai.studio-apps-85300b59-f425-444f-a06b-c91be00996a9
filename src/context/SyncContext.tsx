import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  savePendingSync,
  getPendingSyncItems,
  removePendingSyncItem,
  saveCachedClient,
  getCachedClients,
  cacheClientsLocally
} from '../lib/idb';
import { ClientData, PendingSyncItem } from '../types';
import { db, stripUndefined } from '../lib/firebase';
import { doc, setDoc, getDoc, collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { recordAuditLog } from '../lib/audit';
import { useAuth } from './AuthContext';

const CLIENTS_SYNC_CHANNEL = 'clientes_pro_clients_sync';

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

function broadcastClientsUpdated(clientId?: string) {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(CLIENTS_SYNC_CHANNEL);
      ch.postMessage({ type: 'clients_updated', clientId, ts: Date.now() });
      ch.close();
    }
  } catch {
    // Ignore BroadcastChannel errors
  }
}

function getInitialSampleClients(): ClientData[] {
  const now = Date.now();
  return [
    {
      clientId: 'CLI_DO_001',
      fullName: 'Rafael Antonio De La Cruz',
      businessName: 'Colmado San Rafael',
      cedula: '001-0872635-7',
      phone: '8095412234',
      secondaryPhone: '8296541122',
      sector: 'Piantini (Distrito Nacional)',
      street: 'Av. Gustavo Mejía Ricart',
      localNumber: 'No. 45-B',
      additionalAddress: 'Esq. Manuel de Jesús Troncoso, frente a torre corporativa',
      latitude: 18.473520,
      longitude: -69.932450,
      accuracy: 4.2,
      capturedAt: new Date(now - 3600000 * 5).toISOString(),
      sellerId: 'sample_seller_carlos',
      sellerName: 'Carlos Manuel Gómez',
      adminId: 'admin_luis_owner',
      createdAt: new Date(now - 3600000 * 5).toISOString(),
      updatedAt: new Date(now - 3600000 * 5).toISOString(),
      syncStatus: 'synced'
    },
    {
      clientId: 'CLI_DO_002',
      fullName: 'Ana María Rodríguez Peña',
      businessName: 'Distribuidora Los Prados',
      cedula: '001-1678942-1',
      phone: '8296338891',
      sector: 'Los Prados (Distrito Nacional)',
      street: 'Calle Lorenzo Despradel',
      localNumber: 'No. 12',
      additionalAddress: 'Al lado de la panadería Los Prados',
      latitude: 18.481230,
      longitude: -69.954120,
      accuracy: 6.8,
      capturedAt: new Date(now - 86400000 * 2).toISOString(),
      sellerId: 'sample_seller_carlos',
      sellerName: 'Carlos Manuel Gómez',
      adminId: 'admin_luis_owner',
      createdAt: new Date(now - 86400000 * 2).toISOString(),
      updatedAt: new Date(now - 86400000 * 2).toISOString(),
      syncStatus: 'synced'
    },
    {
      clientId: 'CLI_DO_003',
      fullName: 'Juan Carlos Morales Jiménez',
      businessName: 'Farmacia Gurabo',
      cedula: '031-0456123-2',
      phone: '8095827712',
      sector: 'Santiago - Gurabo',
      street: 'Carretera Luperón Km 3.5',
      localNumber: 'No. 104',
      additionalAddress: 'Frente a plaza comercial Gurabo',
      latitude: 19.467810,
      longitude: -70.672340,
      accuracy: 5.1,
      capturedAt: new Date(now - 86400000 * 4).toISOString(),
      sellerId: 'sample_seller_carlos',
      sellerName: 'Carlos Manuel Gómez',
      adminId: 'admin_luis_owner',
      createdAt: new Date(now - 86400000 * 4).toISOString(),
      updatedAt: new Date(now - 86400000 * 4).toISOString(),
      syncStatus: 'synced'
    }
  ];
}

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, userProfile, activeRole } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [pendingItems, setPendingItems] = useState<PendingSyncItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const isSyncingRef = useRef<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [allClients, setAllClients] = useState<ClientData[]>([]);
  const [loadingClients, setLoadingClients] = useState<boolean>(true);

  const updatePendingState = useCallback(async () => {
    try {
      const items = await getPendingSyncItems();
      setPendingItems(items);
      setPendingCount(items.length);
    } catch (e) {
      console.warn('Error reading pending items:', e);
    }
  }, []);

  const loadLocalClientsForActiveUser = useCallback(async () => {
    let cached = await getCachedClients();
    const localPending = await getPendingSyncItems();
    const mergedMap = new Map<string, ClientData>();
    cached.forEach((c) => mergedMap.set(c.clientId, c));
    localPending.forEach((p) => mergedMap.set(p.clientId, p.clientData));

    let localClients = Array.from(mergedMap.values());
    if (localClients.length === 0) {
      localClients = getInitialSampleClients();
      await cacheClientsLocally(localClients);
    }

    if (userProfile && activeRole === 'seller') {
      const sellerOnly = localClients.filter((c) => c.sellerId === userProfile.uid);
      sellerOnly.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAllClients(sellerOnly);
    } else {
      localClients.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAllClients(localClients);
    }
  }, [userProfile, activeRole]);

  // Fetch or sync all clients from Firestore (when authenticated) or IndexedDB
  const refreshClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      if (isOnline && currentUser && userProfile) {
        const q =
          activeRole === 'admin'
            ? collection(db, 'clients')
            : query(collection(db, 'clients'), where('sellerId', '==', currentUser.uid));

        const snapshot = await getDocs(q);
        const remoteClients: ClientData[] = [];
        snapshot.forEach((docSnap) => {
          remoteClients.push(docSnap.data() as ClientData);
        });

        const localPending = await getPendingSyncItems();
        const cachedLocal = await getCachedClients();

        const mergedMap = new Map<string, ClientData>();
        // Preserve any locally created seller records in same browser for Admin view
        if (activeRole === 'admin') {
          cachedLocal.forEach((c) => mergedMap.set(c.clientId, c));
        }
        remoteClients.forEach((c) => mergedMap.set(c.clientId, c));
        localPending.forEach((p) => mergedMap.set(p.clientId, p.clientData));

        let finalClients = Array.from(mergedMap.values());
        if (finalClients.length === 0 && activeRole === 'admin') {
          finalClients = getInitialSampleClients();
        }

        finalClients.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setAllClients(finalClients);
        if (activeRole === 'admin' && finalClients.length > 0) {
          await cacheClientsLocally(finalClients);
        }
      } else {
        await loadLocalClientsForActiveUser();
      }
    } catch (err) {
      console.warn('Error fetching clients, falling back to local DB:', err);
      await loadLocalClientsForActiveUser().catch(() => {});
    } finally {
      setLoadingClients(false);
    }
  }, [isOnline, currentUser, userProfile, activeRole, loadLocalClientsForActiveUser]);

  // Real-time Firestore listener so Admin receives Seller clients live across devices
  useEffect(() => {
    if (!isOnline || !currentUser || !userProfile) return;

    const q =
      activeRole === 'admin'
        ? collection(db, 'clients')
        : query(collection(db, 'clients'), where('sellerId', '==', currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const remoteClients: ClientData[] = [];
        snapshot.forEach((docSnap) => {
          remoteClients.push(docSnap.data() as ClientData);
        });

        const localPending = await getPendingSyncItems();
        const cachedLocal = activeRole === 'admin' ? await getCachedClients() : [];
        const mergedMap = new Map<string, ClientData>();
        cachedLocal.forEach((c) => mergedMap.set(c.clientId, c));
        remoteClients.forEach((c) => mergedMap.set(c.clientId, c));
        localPending.forEach((p) => mergedMap.set(p.clientId, p.clientData));

        const finalClients = Array.from(mergedMap.values());
        finalClients.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setAllClients(finalClients);
        setLoadingClients(false);
      },
      (err) => {
        console.warn('Error en suscripción en vivo de clientes:', err);
      }
    );

    return () => unsubscribe();
  }, [isOnline, currentUser, userProfile, activeRole]);

  // Real-time cross-tab BroadcastChannel listener so Admin sees newly registered Seller clients instantly
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(CLIENTS_SYNC_CHANNEL);
        channel.onmessage = () => {
          loadLocalClientsForActiveUser().catch(() => {});
        };
      }
    } catch {
      channel = null;
    }

    return () => {
      if (channel) channel.close();
    };
  }, [loadLocalClientsForActiveUser]);

  // Execute synchronization queue (only writes to Firestore when authenticated)
  const processSyncQueue = useCallback(async () => {
    if (!navigator.onLine || !currentUser || isSyncingRef.current) return;

    const queue = await getPendingSyncItems();
    if (queue.length === 0) {
      await updatePendingState();
      return;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncProgress({ current: 0, total: queue.length });

    let processedCount = 0;

    for (const item of queue) {
      try {
        const clientRef = doc(db, 'clients', item.clientId);

        const normalizedSellerId =
          !item.clientData.sellerId ||
          item.clientData.sellerId === 'offline-seller' ||
          item.clientData.sellerId === 'admin_luis_owner'
            ? currentUser.uid
            : item.clientData.sellerId;

        const baseRecord: ClientData = {
          ...item.clientData,
          sellerId: normalizedSellerId,
          syncStatus: 'synced'
        };
        delete baseRecord.syncError;

        if (item.action === 'delete') {
          const deletedRecord = stripUndefined({
            ...baseRecord,
            deletedAt: baseRecord.deletedAt || new Date().toISOString()
          });
          await setDoc(clientRef, deletedRecord, { merge: true });
          await saveCachedClient(deletedRecord);
        } else {
          const remoteSnap = await getDoc(clientRef);
          if (remoteSnap.exists()) {
            const remoteData = remoteSnap.data() as ClientData;
            const remoteTime = new Date(remoteData.updatedAt || remoteData.createdAt).getTime();
            const localTime = new Date(item.clientData.updatedAt || item.clientData.createdAt).getTime();

            if (remoteTime > localTime && remoteData.sellerId !== item.clientData.sellerId) {
              console.warn(`Conflict detected for ${item.clientId}: Remote version is newer`);
            }
          }

          const syncedRecord = stripUndefined(baseRecord);
          await setDoc(clientRef, syncedRecord);
          await saveCachedClient(syncedRecord);
        }

        await removePendingSyncItem(item.id);
        broadcastClientsUpdated(item.clientId);

        if (userProfile) {
          recordAuditLog(userProfile, 'SINCRONIZAR', {
            clientId: item.clientId,
            clientName: item.clientData.fullName,
            changes: `Sincronización exitosa (${item.action})`
          });
        }
      } catch (error: any) {
        console.error(`Error syncing item ${item.clientId}:`, error);
        await savePendingSync({
          ...item,
          retryCount: item.retryCount + 1,
          lastError: error?.message || 'Error de red'
        });
      } finally {
        processedCount++;
        setSyncProgress({ current: processedCount, total: queue.length });
      }
    }

    isSyncingRef.current = false;
    setIsSyncing(false);
    setSyncProgress(null);
    await updatePendingState();
    await refreshClients();
  }, [currentUser, updatePendingState, refreshClients, userProfile]);

  // Queue client registration or update
  const enqueueClient = async (clientData: ClientData, action: 'create' | 'update' | 'delete' = 'create') => {
    const canSyncNow = navigator.onLine && Boolean(currentUser);
    const cleanData = stripUndefined({
      ...clientData,
      syncStatus: (canSyncNow ? 'syncing' : isOnline ? 'synced' : 'pending') as ClientData['syncStatus']
    });
    delete cleanData.syncError;

    // If working via Admin-created credentials or local workspace without Firebase Auth session,
    // persist cleanly in IndexedDB and notify the Admin tab in real time
    if (!currentUser) {
      const localRecord: ClientData = {
        ...cleanData,
        syncStatus: isOnline ? 'synced' : 'pending'
      };
      await saveCachedClient(localRecord);
      broadcastClientsUpdated(localRecord.clientId);
      setAllClients((prev) => {
        const idx = prev.findIndex((c) => c.clientId === localRecord.clientId);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = localRecord;
          return copy;
        }
        return [localRecord, ...prev];
      });
      return;
    }

    const queueId = `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const pendingItem: PendingSyncItem = {
      id: queueId,
      clientId: clientData.clientId,
      action,
      clientData: cleanData,
      timestamp: Date.now(),
      retryCount: 0
    };

    await savePendingSync(pendingItem);
    await saveCachedClient(cleanData);
    broadcastClientsUpdated(clientData.clientId);
    await updatePendingState();

    setAllClients((prev) => {
      const idx = prev.findIndex((c) => c.clientId === clientData.clientId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = pendingItem.clientData;
        return copy;
      }
      return [pendingItem.clientData, ...prev];
    });

    if (canSyncNow) {
      setTimeout(() => {
        processSyncQueue();
      }, 150);
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

  // Online / Offline listeners & initial load
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

  // Flush pending sync queue when user authenticates while online
  useEffect(() => {
    if (currentUser && isOnline) {
      processSyncQueue();
    }
  }, [currentUser, isOnline, processSyncQueue]);

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
