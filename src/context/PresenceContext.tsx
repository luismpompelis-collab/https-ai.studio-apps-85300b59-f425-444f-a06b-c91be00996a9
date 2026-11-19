import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { PresenceRecord } from '../types';
import {
  LOCAL_PRESENCE_KEY,
  PRESENCE_CHANNEL_NAME,
  PRESENCE_HEARTBEAT_MS,
  getLastSeenMillis,
  isPresenceActive,
  readLocalPresenceRecords,
  writeLocalPresenceHeartbeat,
  writePresenceHeartbeat
} from '../lib/presence';

interface PresenceContextType {
  connectedSellers: PresenceRecord[];
  totalConnectedSellers: number;
  connectedAdmins: PresenceRecord[];
  isAdminOnline: boolean;
  presenceByUid: Record<string, PresenceRecord>;
  isLiveTracking: boolean;
  nowMs: number;
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

export const PresenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, userProfile, activeRole } = useAuth();
  const [remoteRecords, setRemoteRecords] = useState<PresenceRecord[]>([]);
  const [localRecords, setLocalRecords] = useState<PresenceRecord[]>(() => readLocalPresenceRecords());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Keep current timestamp ticking so stale connections drop off automatically
  useEffect(() => {
    const ticker = setInterval(() => {
      setNowMs(Date.now());
    }, 10_000);
    return () => clearInterval(ticker);
  }, []);

  // Broadcast active user's own online heartbeat (both local cross-tab AND Firestore when authenticated)
  useEffect(() => {
    if (!userProfile) return;

    const uid = currentUser?.uid || userProfile.uid;
    const fullName = userProfile.fullName || currentUser?.displayName || 'Usuario';
    const role = userProfile.role;
    const adminId = userProfile.adminId || null;

    const sendOnline = () => {
      writeLocalPresenceHeartbeat(uid, fullName, role, true, adminId);
      setLocalRecords(readLocalPresenceRecords());
      setNowMs(Date.now());

      if (currentUser && navigator.onLine) {
        writePresenceHeartbeat(uid, fullName, role, true).catch((err) => {
          console.warn('No se pudo actualizar presencia en línea:', err);
        });
      }
    };

    sendOnline();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        sendOnline();
      }
    }, PRESENCE_HEARTBEAT_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendOnline();
      }
    };

    const handleOnline = () => sendOnline();

    const handlePageHide = () => {
      writeLocalPresenceHeartbeat(uid, fullName, role, false, adminId);
      if (currentUser) {
        writePresenceHeartbeat(uid, fullName, role, false).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [currentUser, userProfile]);

  // Listen to local cross-tab presence updates via BroadcastChannel & storage event
  useEffect(() => {
    const syncLocal = () => {
      setLocalRecords(readLocalPresenceRecords());
      setNowMs(Date.now());
    };

    syncLocal();

    const handleStorage = (e: StorageEvent) => {
      if (e.key === LOCAL_PRESENCE_KEY) {
        syncLocal();
      }
    };

    window.addEventListener('storage', handleStorage);

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(PRESENCE_CHANNEL_NAME);
        channel.onmessage = () => syncLocal();
      }
    } catch {
      channel = null;
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (channel) channel.close();
    };
  }, []);

  // Listen to Firestore team presence in real time when signed in with Firebase Auth
  useEffect(() => {
    if (!currentUser) {
      setRemoteRecords([]);
      return;
    }

    const targetQuery =
      activeRole === 'admin'
        ? collection(db, 'presence')
        : query(collection(db, 'presence'), where('role', '==', 'admin'));

    const unsubscribe = onSnapshot(
      targetQuery,
      (snapshot) => {
        const list: PresenceRecord[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as PresenceRecord;
          if (data && (data.role === 'admin' || data.role === 'seller')) {
            list.push(data);
          }
        });
        setRemoteRecords(list);
        setNowMs(Date.now());
      },
      (err) => {
        console.warn('Error escuchando presencia del equipo:', err);
      }
    );

    return () => unsubscribe();
  }, [currentUser, activeRole]);

  const {
    connectedSellers,
    totalConnectedSellers,
    connectedAdmins,
    isAdminOnline,
    presenceByUid
  } = useMemo(() => {
    const mergedMap = new Map<string, PresenceRecord>();

    const mergeRecord = (rec: PresenceRecord) => {
      if (!rec || !rec.uid || (rec.role !== 'admin' && rec.role !== 'seller')) return;
      const existing = mergedMap.get(rec.uid);
      if (!existing) {
        mergedMap.set(rec.uid, rec);
        return;
      }
      const existingMs = getLastSeenMillis(existing.lastSeenAt);
      const incomingMs = getLastSeenMillis(rec.lastSeenAt);
      if (incomingMs >= existingMs) {
        mergedMap.set(rec.uid, rec);
      }
    };

    localRecords.forEach(mergeRecord);
    remoteRecords.forEach(mergeRecord);

    const sellers: PresenceRecord[] = [];
    const admins: PresenceRecord[] = [];
    const map: Record<string, PresenceRecord> = {};

    mergedMap.forEach((rec) => {
      map[rec.uid] = rec;
      if (!isPresenceActive(rec, nowMs)) return;

      if (rec.role === 'seller') {
        sellers.push(rec);
      } else if (rec.role === 'admin') {
        admins.push(rec);
      }
    });

    sellers.sort((a, b) => a.fullName.localeCompare(b.fullName));
    admins.sort((a, b) => a.fullName.localeCompare(b.fullName));

    return {
      connectedSellers: sellers,
      totalConnectedSellers: sellers.length,
      connectedAdmins: admins,
      isAdminOnline: admins.length > 0,
      presenceByUid: map
    };
  }, [localRecords, remoteRecords, nowMs]);

  return (
    <PresenceContext.Provider
      value={{
        connectedSellers,
        totalConnectedSellers,
        connectedAdmins,
        isAdminOnline,
        presenceByUid,
        isLiveTracking: Boolean(userProfile),
        nowMs
      }}
    >
      {children}
    </PresenceContext.Provider>
  );
};

export const usePresence = () => {
  const ctx = useContext(PresenceContext);
  if (!ctx) {
    throw new Error('usePresence must be used within a PresenceProvider');
  }
  return ctx;
};
