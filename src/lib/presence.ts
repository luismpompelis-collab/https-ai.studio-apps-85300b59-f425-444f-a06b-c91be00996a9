import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { PresenceRecord, UserRole } from '../types';

export const PRESENCE_HEARTBEAT_MS = 40_000;
export const PRESENCE_TIMEOUT_MS = 120_000;

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
