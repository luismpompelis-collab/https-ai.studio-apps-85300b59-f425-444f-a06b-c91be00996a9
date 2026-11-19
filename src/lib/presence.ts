import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { PresenceRecord, UserRole } from '../types';

export const PRESENCE_HEARTBEAT_MS = 20_000;
export const PRESENCE_TIMEOUT_MS = 90_000;
export const LOCAL_PRESENCE_KEY = 'clientes_pro_local_presence';
export const PRESENCE_CHANNEL_NAME = 'clientes_pro_presence';

export async function writePresenceHeartbeat(
  uid: string,
  fullName: string,
  role: UserRole,
  isOnline: boolean
): Promise<void> {
  if (!uid) return;
  const presenceRef = doc(db, 'presence', uid);
  await setDoc(presenceRef, {
    uid,
    fullName: (fullName || 'Usuario').trim().slice(0, 150) || 'Usuario',
    role,
    isOnline,
    lastSeenAt: serverTimestamp()
  });
}

export function readLocalPresenceRecords(): PresenceRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_PRESENCE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, PresenceRecord>;
    if (!parsed || typeof parsed !== 'object') return [];
    return Object.values(parsed).filter((rec) => rec && (rec.role === 'admin' || rec.role === 'seller'));
  } catch {
    return [];
  }
}

export function writeLocalPresenceHeartbeat(
  uid: string,
  fullName: string,
  role: UserRole,
  isOnline: boolean,
  adminId?: string | null
): void {
  if (!uid) return;
  try {
    const raw = localStorage.getItem(LOCAL_PRESENCE_KEY);
    const map: Record<string, PresenceRecord> = raw ? JSON.parse(raw) : {};
    map[uid] = {
      uid,
      fullName: (fullName || 'Usuario').trim().slice(0, 150) || 'Usuario',
      role,
      isOnline,
      lastSeenAt: Date.now(),
      adminId: adminId || null
    };
    localStorage.setItem(LOCAL_PRESENCE_KEY, JSON.stringify(map));

    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(PRESENCE_CHANNEL_NAME);
      ch.postMessage({ type: 'presence_updated', uid, isOnline, ts: Date.now() });
      ch.close();
    }
  } catch {
    // Ignore localStorage / BroadcastChannel errors
  }
}

export function getLastSeenMillis(lastSeenAt: unknown): number {
  if (!lastSeenAt) return 0;
  if (typeof lastSeenAt === 'number') return lastSeenAt;
  if (typeof lastSeenAt === 'string') {
    const parsed = Date.parse(lastSeenAt);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof lastSeenAt === 'object') {
    const ts = lastSeenAt as { toMillis?: () => number; seconds?: number };
    if (typeof ts.toMillis === 'function') {
      return ts.toMillis();
    }
    if (typeof ts.seconds === 'number') {
      return ts.seconds * 1000;
    }
  }
  return 0;
}

export function isPresenceActive(record: PresenceRecord, nowMs: number = Date.now()): boolean {
  if (!record.isOnline) return false;
  const seenMs = getLastSeenMillis(record.lastSeenAt);
  if (!seenMs) return false;
  return nowMs - seenMs <= PRESENCE_TIMEOUT_MS;
}

export function formatLastSeenAgo(lastSeenAt: unknown, nowMs: number = Date.now()): string {
  const seenMs = getLastSeenMillis(lastSeenAt);
  if (!seenMs) return 'Reciente';
  const diffSec = Math.max(0, Math.floor((nowMs - seenMs) / 1000));
  if (diffSec < 15) return 'Ahora mismo';
  if (diffSec < 60) return `Hace ${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  return `Hace ${diffMin} min`;
}
