import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile } from '../types';

export const SELLERS_DIRECTORY_KEY = 'clientes_pro_sellers_directory';
const LEGACY_LOCAL_USERS_KEY = 'clientes_pro_local_users';
export const SELLERS_SYNC_CHANNEL = 'clientes_pro_sellers_sync';

export interface LocalSellerRecord extends UserProfile {
  passwordHash?: string;
}

function fallbackHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `fb_${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)}`;
}

export async function hashPassword(password: string): Promise<string> {
  const salted = `clientes_pro_v1::${password}`;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const data = new TextEncoder().encode(salted);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Fallback when subtle crypto is unavailable
  }
  return fallbackHash(salted);
}

export function emailToInviteId(email: string): string {
  const normalized = email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `inv_${normalized}`.slice(0, 120);
}

export function sanitizeRole(role: unknown): 'admin' | 'seller' {
  return role === 'admin' ? 'admin' : 'seller';
}

function broadcastDirectoryUpdate() {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(SELLERS_SYNC_CHANNEL);
      ch.postMessage({ type: 'directory_updated', ts: Date.now() });
      ch.close();
    }
  } catch {
    // Ignore BroadcastChannel errors
  }
}

export function getLocalDirectoryUsers(): LocalSellerRecord[] {
  try {
    const raw = localStorage.getItem(SELLERS_DIRECTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalSellerRecord[];
      if (Array.isArray(parsed)) {
        return parsed.map((u) => ({
          ...u,
          role: sanitizeRole(u.role)
        }));
      }
    }

    // Migrate legacy storage key once if present
    const legacyRaw = localStorage.getItem(LEGACY_LOCAL_USERS_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as LocalSellerRecord[];
      if (Array.isArray(legacy)) {
        const migrated = legacy.map((u) => ({
          ...u,
          role: sanitizeRole(u.role)
        }));
        localStorage.setItem(SELLERS_DIRECTORY_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch {
    // Ignore malformed localStorage
  }
  return [];
}

export function saveLocalDirectoryUsers(users: LocalSellerRecord[]): void {
  try {
    const clean = users.map((u) => ({
      ...u,
      role: sanitizeRole(u.role)
    }));
    localStorage.setItem(SELLERS_DIRECTORY_KEY, JSON.stringify(clean));
    broadcastDirectoryUpdate();
  } catch (err) {
    console.warn('No se pudo guardar el directorio local de vendedores:', err);
  }
}

export function upsertLocalDirectoryUser(record: LocalSellerRecord): LocalSellerRecord[] {
  const existing = getLocalDirectoryUsers();
  const normalizedEmail = record.email.trim().toLowerCase();
  const idx = existing.findIndex(
    (u) => u.uid === record.uid || u.email.trim().toLowerCase() === normalizedEmail
  );

  const nextRecord: LocalSellerRecord = {
    ...record,
    email: normalizedEmail,
    username: (record.username || normalizedEmail.split('@')[0]).trim().toLowerCase(),
    role: sanitizeRole(record.role),
    passwordHash: record.passwordHash || (idx >= 0 ? existing[idx].passwordHash : undefined)
  };

  let nextList: LocalSellerRecord[];
  if (idx >= 0) {
    nextList = [...existing];
    nextList[idx] = { ...existing[idx], ...nextRecord };
  } else {
    nextList = [nextRecord, ...existing];
  }

  saveLocalDirectoryUsers(nextList);
  return nextList;
}

export function syncRemoteUsersToLocalDirectory(remoteUsers: UserProfile[]): LocalSellerRecord[] {
  const existing = getLocalDirectoryUsers();
  const byUid = new Map<string, LocalSellerRecord>();
  const byEmail = new Map<string, LocalSellerRecord>();

  existing.forEach((u) => {
    byUid.set(u.uid, u);
    byEmail.set(u.email.trim().toLowerCase(), u);
  });

  remoteUsers.forEach((remote) => {
    const emailKey = remote.email.trim().toLowerCase();
    const prev = byUid.get(remote.uid) || byEmail.get(emailKey);
    const merged: LocalSellerRecord = {
      ...prev,
      ...remote,
      email: emailKey,
      role: sanitizeRole(remote.role),
      passwordHash: prev?.passwordHash
    };
    byUid.set(merged.uid, merged);
    byEmail.set(emailKey, merged);
  });

  const mergedList = Array.from(byUid.values());
  saveLocalDirectoryUsers(mergedList);
  return mergedList;
}

export function findLocalDirectoryUserByIdentifier(identifier: string): LocalSellerRecord | null {
  const clean = identifier.trim().toLowerCase();
  if (!clean) return null;

  const users = getLocalDirectoryUsers();
  return (
    users.find((u) => {
      const uEmail = u.email.trim().toLowerCase();
      const uUsername = (u.username || '').trim().toLowerCase();
      return (
        uEmail === clean ||
        uUsername === clean ||
        (!clean.includes('@') && uEmail === `${clean}@clientespro.do`)
      );
    }) || null
  );
}

export function stripPasswordHash(record: LocalSellerRecord): UserProfile {
  const { passwordHash: _ignored, ...profile } = record;
  return {
    ...profile,
    role: sanitizeRole(profile.role)
  };
}

export async function authenticateLocalUser(
  identifier: string,
  password: string
): Promise<{ user: UserProfile } | { error: string } | null> {
  const match = findLocalDirectoryUserByIdentifier(identifier);
  if (!match) return null;

  if (!match.passwordHash) {
    return {
      error:
        'Esta cuenta fue registrada con Google o aún no tiene contraseña asignada. Inicia sesión con Google o solicita al Administrador actualizar tu contraseña.'
    };
  }

  const candidateHash = await hashPassword(password);
  if (candidateHash !== match.passwordHash) {
    return { error: 'Contraseña incorrecta.' };
  }

  if (!match.active) {
    return { error: 'Tu cuenta ha sido suspendida por el Administrador.' };
  }

  return { user: stripPasswordHash(match) };
}

/**
 * Attempts to create a real Firebase Auth Email/Password user using a secondary
 * Firebase App instance so the currently signed-in Administrator stays logged in.
 * Falls back gracefully if Email/Password Auth is not enabled in Firebase Console.
 */
export async function tryCreateFirebaseAuthSeller(
  email: string,
  password: string
): Promise<{ uid: string | null; authCreated: boolean; errorCode?: string }> {
  const secondaryAppName = `seller_creator_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  let secondaryApp;
  try {
    secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim().toLowerCase(), password);
    const createdUid = cred.user.uid;
    await signOut(secondaryAuth).catch(() => {});
    return { uid: createdUid, authCreated: true };
  } catch (err: any) {
    return {
      uid: null,
      authCreated: false,
      errorCode: err?.code || 'unknown'
    };
  } finally {
    if (secondaryApp) {
      await deleteApp(secondaryApp).catch(() => {});
    }
  }
}
