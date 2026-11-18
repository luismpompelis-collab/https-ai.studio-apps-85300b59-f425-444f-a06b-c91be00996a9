import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { PresenceRecord } from '../types';
import {
  PRESENCE_HEARTBEAT_MS,
  isPresenceActive,
  writePresenceHeartbeat
} from '../lib/presence';

interface PresenceContextType {
  connectedSupervisors: PresenceRecord[];
  connectedSellers: PresenceRecord[];
  totalConnectedTeam: number;
  connectedAdmins: PresenceRecord[];
  presenceByUid: Record<string, PresenceRecord>;
  isLiveTracking: boolean;
  nowMs: number;
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

export const PresenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, userProfile, activeRole } = useAuth();
  const [records, setRecords] = useState<PresenceRecord[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Keep current timestamp ticking so stale connections drop off automatically
  useEffect(() => {
    const ticker = setInterval(() => {
      setNowMs(Date.now());
    }, 15_000);
    return () => clearInterval(ticker);
  }, []);

  // Broadcast authenticated user's own online heartbeat to Firestore
  useEffect(() => {
    if (!currentUser || !userProfile) return;

    const uid = currentUser.uid;
    const fullName = userProfile.fullName || currentUser.displayName || 'Usuario';
    const role = userProfile.role;

    const sendOnline = () => {
      if (navigator.onLine) {
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
      writePresenceHeartbeat(uid, fullName, role, false).catch(() => {});
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

  // Listen to team presence in real time when signed in as Admin
  useEffect(() => {
    if (!currentUser || activeRole !== 'admin') {
      setRecords([]);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'presence'),
      (snapshot) => {
        const list: PresenceRecord[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as PresenceRecord);
        });
        setRecords(list);
        setNowMs(Date.now());
      },
      (err) => {
        console.warn('Error escuchando presencia del equipo:', err);
      }
    );

    return () => unsubscribe();
  }, [currentUser, activeRole]);

  const {
    connectedSupervisors,
    connectedSellers,
    totalConnectedTeam,
    connectedAdmins,
    presenceByUid
  } = useMemo(() => {
    const supervisors: PresenceRecord[] = [];
    const sellers: PresenceRecord[] = [];
    const admins: PresenceRecord[] = [];
    const map: Record<string, PresenceRecord> = {};

    records.forEach((rec) => {
      map[rec.uid] = rec;
      if (!isPresenceActive(rec, nowMs)) return;

      if (rec.role === 'supervisor') {
        supervisors.push(rec);
      } else if (rec.role === 'seller') {
        sellers.push(rec);
      } else if (rec.role === 'admin') {
        admins.push(rec);
      }
    });

    supervisors.sort((a, b) => a.fullName.localeCompare(b.fullName));
    sellers.sort((a, b) => a.fullName.localeCompare(b.fullName));

    return {
      connectedSupervisors: supervisors,
      connectedSellers: sellers,
      totalConnectedTeam: supervisors.length + sellers.length,
      connectedAdmins: admins,
      presenceByUid: map
    };
  }, [records, nowMs]);

  return (
    <PresenceContext.Provider
      value={{
        connectedSupervisors,
        connectedSellers,
        totalConnectedTeam,
        connectedAdmins,
        presenceByUid,
        isLiveTracking: Boolean(currentUser),
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
