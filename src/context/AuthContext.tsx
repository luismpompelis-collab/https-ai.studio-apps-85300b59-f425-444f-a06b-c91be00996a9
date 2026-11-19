import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, googleProvider, db, stripUndefined } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { recordAuditLog } from '../lib/audit';
import { writeLocalPresenceHeartbeat, writePresenceHeartbeat } from '../lib/presence';
import {
  SELLERS_DIRECTORY_KEY,
  SELLERS_SYNC_CHANNEL,
  authenticateLocalUser,
  emailToInviteId,
  findLocalDirectoryUserByIdentifier,
  getLocalDirectoryUsers,
  hashPassword,
  sanitizeRole,
  stripPasswordHash,
  upsertLocalDirectoryUser
} from '../lib/sellerDirectory';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  sessionNotice: string | null;
  clearSessionNotice: () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (identifier: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, fullName: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  activeRole: UserRole;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const BOOTSTRAP_ADMIN_EMAIL = 'luismpompelis@gmail.com';
const DEFAULT_ADMIN_PROFILE: UserProfile = {
  uid: 'admin_luis_owner',
  fullName: 'Luis M. Pompelis',
  username: 'luispompelis',
  email: 'LuisMPompelis@gmail.com',
  role: 'admin',
  adminId: null,
  adminName: null,
  active: true,
  createdAt: new Date().toISOString()
};

const ACTIVE_SESSION_KEY = 'clientes_pro_active_session';
const EXPLICIT_LOGOUT_KEY = 'clientes_pro_logged_out';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const clearSessionNotice = useCallback(() => setSessionNotice(null), []);

  // Sync profile from Firestore (including claiming Admin-created seller invites)
  const fetchUserProfile = useCallback(async (user: FirebaseUser): Promise<UserProfile> => {
    const userRef = doc(db, 'users', user.uid);
    const isDefaultAdmin = user.email ? user.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL : false;

    try {
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const raw = snap.data() as UserProfile;
        const normalizedRole: UserRole = isDefaultAdmin ? 'admin' : sanitizeRole(raw.role);
        const profile: UserProfile = {
          ...raw,
          role: normalizedRole,
          adminId: normalizedRole === 'admin' ? null : raw.adminId || DEFAULT_ADMIN_PROFILE.uid,
          adminName: normalizedRole === 'admin' ? null : raw.adminName || DEFAULT_ADMIN_PROFILE.fullName
        };

        if (raw.role !== normalizedRole) {
          await updateDoc(userRef, { role: normalizedRole }).catch(() => {});
        }
        return profile;
      }

      // Check if the Administrator pre-created a seller invite for this email
      if (user.email && !isDefaultAdmin) {
        try {
          const inviteRef = doc(db, 'seller_invites', emailToInviteId(user.email));
          const inviteSnap = await getDoc(inviteRef);
          if (inviteSnap.exists()) {
            const invite = inviteSnap.data() as Partial<UserProfile>;
            const claimedProfile: UserProfile = stripUndefined({
              uid: user.uid,
              fullName: invite.fullName || user.displayName || user.email.split('@')[0] || 'Vendedor',
              username:
                invite.username ||
                user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, ''),
              email: user.email.toLowerCase(),
              role: 'seller',
              adminId: invite.adminId || DEFAULT_ADMIN_PROFILE.uid,
              adminName: invite.adminName || DEFAULT_ADMIN_PROFILE.fullName,
              active: invite.active !== false,
              createdAt: invite.createdAt || new Date().toISOString()
            });
            await setDoc(userRef, claimedProfile).catch(() => {});
            return claimedProfile;
          }
        } catch (inviteErr) {
          console.warn('No se pudo verificar invitación de vendedor:', inviteErr);
        }
      }

      // Check local directory in case Admin created this seller in the same browser
      const localMatch = user.email ? findLocalDirectoryUserByIdentifier(user.email) : null;

      const initialProfile: UserProfile = stripUndefined({
        uid: user.uid,
        fullName:
          localMatch?.fullName ||
          user.displayName ||
          user.email?.split('@')[0] ||
          (isDefaultAdmin ? DEFAULT_ADMIN_PROFILE.fullName : 'Vendedor'),
        username:
          localMatch?.username ||
          (user.email?.split('@')[0] || 'usuario').toLowerCase().replace(/[^a-z0-9_]/g, ''),
        email: (user.email || `${user.uid}@clientespro.do`).toLowerCase(),
        role: isDefaultAdmin ? 'admin' : 'seller',
        adminId: isDefaultAdmin ? null : localMatch?.adminId || DEFAULT_ADMIN_PROFILE.uid,
        adminName: isDefaultAdmin ? null : localMatch?.adminName || DEFAULT_ADMIN_PROFILE.fullName,
        active: localMatch ? localMatch.active : true,
        createdAt: localMatch?.createdAt || new Date().toISOString()
      });

      await setDoc(userRef, initialProfile).catch((e) => {
        console.warn('Could not write profile to Firestore:', e);
      });
      return initialProfile;
    } catch (err) {
      console.warn('Could not read user profile from Firestore, using fallback:', err);
      const localMatch = user.email ? findLocalDirectoryUserByIdentifier(user.email) : null;
      return {
        uid: user.uid,
        fullName:
          localMatch?.fullName ||
          user.displayName ||
          (isDefaultAdmin ? DEFAULT_ADMIN_PROFILE.fullName : 'Vendedor'),
        username: localMatch?.username || user.email?.split('@')[0] || 'usuario',
        email: (user.email || 'offline@clientespro.do').toLowerCase(),
        role: isDefaultAdmin ? 'admin' : 'seller',
        adminId: isDefaultAdmin ? null : localMatch?.adminId || DEFAULT_ADMIN_PROFILE.uid,
        adminName: isDefaultAdmin ? null : localMatch?.adminName || DEFAULT_ADMIN_PROFILE.fullName,
        active: localMatch ? localMatch.active : true,
        createdAt: localMatch?.createdAt || new Date().toISOString()
      };
    }
  }, []);

  // Boot auth state & per-tab session restoration
  useEffect(() => {
    const readTabSession = (): UserProfile | null => {
      const savedSession = sessionStorage.getItem(ACTIVE_SESSION_KEY);
      const explicitlyLoggedOut = sessionStorage.getItem(EXPLICIT_LOGOUT_KEY) === 'true';

      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession) as UserProfile;
          const sanitized: UserProfile = {
            ...parsed,
            role: sanitizeRole(parsed.role)
          };
          if (sanitized.role === 'seller') {
            const latest = getLocalDirectoryUsers().find(
              (u) => u.uid === sanitized.uid || u.email.toLowerCase() === sanitized.email.toLowerCase()
            );
            if (latest) {
              if (!latest.active) {
                sessionStorage.removeItem(ACTIVE_SESSION_KEY);
                sessionStorage.setItem(EXPLICIT_LOGOUT_KEY, 'true');
                setSessionNotice('Tu cuenta fue suspendida por el Administrador.');
                return null;
              }
              return stripPasswordHash(latest);
            }
          }
          return sanitized;
        } catch {
          sessionStorage.removeItem(ACTIVE_SESSION_KEY);
        }
      }

      if (!explicitlyLoggedOut) {
        sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(DEFAULT_ADMIN_PROFILE));
        return DEFAULT_ADMIN_PROFILE;
      }

      return null;
    };

    const initialTabProfile = readTabSession();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const explicitlyLoggedOut = sessionStorage.getItem(EXPLICIT_LOGOUT_KEY) === 'true';
      const tabSessionRaw = sessionStorage.getItem(ACTIVE_SESSION_KEY);

      // If this tab explicitly logged into a credential-based seller session, keep that tab isolated
      if (tabSessionRaw) {
        try {
          const tabProfile = JSON.parse(tabSessionRaw) as UserProfile;
          if (tabProfile.role === 'seller' && (!user || user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL)) {
            setCurrentUser(null);
            setUserProfile({ ...tabProfile, role: 'seller' });
            setLoading(false);
            return;
          }
        } catch {
          // ignore
        }
      }

      if (user && !explicitlyLoggedOut) {
        setCurrentUser(user);
        sessionStorage.removeItem(ACTIVE_SESSION_KEY);
        sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);
        try {
          const profile = await fetchUserProfile(user);
          if (!profile.active) {
            await fbSignOut(auth).catch(() => {});
            setCurrentUser(null);
            setUserProfile(null);
            setSessionNotice('Tu cuenta ha sido suspendida por el Administrador.');
          } else {
            setUserProfile(profile);
          }
        } catch (e) {
          console.error('Error fetching profile:', e);
        }
      } else if (initialTabProfile) {
        setCurrentUser(null);
        setUserProfile(initialTabProfile);
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchUserProfile]);

  // Keep active seller profile synchronized if Admin edits name or suspends account in another tab
  useEffect(() => {
    if (currentUser || !userProfile || userProfile.role !== 'seller') return;

    const syncFromDirectory = () => {
      const latest = getLocalDirectoryUsers().find(
        (u) => u.uid === userProfile.uid || u.email.toLowerCase() === userProfile.email.toLowerCase()
      );
      if (!latest) return;

      if (!latest.active) {
        writeLocalPresenceHeartbeat(userProfile.uid, userProfile.fullName, 'seller', false, userProfile.adminId);
        sessionStorage.removeItem(ACTIVE_SESSION_KEY);
        sessionStorage.setItem(EXPLICIT_LOGOUT_KEY, 'true');
        setUserProfile(null);
        setSessionNotice('Tu cuenta ha sido suspendida por el Administrador.');
        return;
      }

      const freshProfile = stripPasswordHash(latest);
      if (
        freshProfile.fullName !== userProfile.fullName ||
        freshProfile.username !== userProfile.username ||
        freshProfile.adminName !== userProfile.adminName
      ) {
        sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(freshProfile));
        setUserProfile(freshProfile);
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === SELLERS_DIRECTORY_KEY) syncFromDirectory();
    };
    window.addEventListener('storage', handleStorage);

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(SELLERS_SYNC_CHANNEL);
        channel.onmessage = () => syncFromDirectory();
      }
    } catch {
      channel = null;
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (channel) channel.close();
    };
  }, [currentUser, userProfile]);

  const loginWithGoogle = async () => {
    setSessionNotice(null);
    sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);
    const result = await signInWithPopup(auth, googleProvider);
    if (result.user) {
      const profile = await fetchUserProfile(result.user);
      if (!profile.active) {
        await fbSignOut(auth).catch(() => {});
        throw new Error('Tu cuenta ha sido suspendida por el Administrador.');
      }
      setCurrentUser(result.user);
      setUserProfile(profile);
      recordAuditLog(profile, 'LOGIN', { changes: 'Inicio de sesión con Google' });
    }
  };

  const loginWithEmail = async (identifier: string, pass: string) => {
    setSessionNotice(null);
    const trimmed = identifier.trim();
    if (!trimmed || !pass) {
      throw new Error('Ingresa tu usuario o correo y tu contraseña.');
    }

    // Resolve actual email if user typed their username
    const localCandidate = findLocalDirectoryUserByIdentifier(trimmed);

    // If this seller was provisioned locally (no Firebase Auth email/password UID), authenticate directly
    if (localCandidate && localCandidate.uid.startsWith('usr_')) {
      const localAuth = await authenticateLocalUser(trimmed, pass);
      if (localAuth && 'user' in localAuth) {
        sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);
        sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(localAuth.user));
        setCurrentUser(null);
        setUserProfile(localAuth.user);
        recordAuditLog(localAuth.user, 'LOGIN', {
          changes: `Inicio de sesión de vendedor: ${localAuth.user.fullName}`
        });
        return;
      }
      if (localAuth && 'error' in localAuth) {
        throw new Error(localAuth.error);
      }
    }

    const emailForFirebase = localCandidate
      ? localCandidate.email
      : trimmed.includes('@')
      ? trimmed.toLowerCase()
      : `${trimmed.toLowerCase()}@clientespro.do`;

    try {
      const cred = await signInWithEmailAndPassword(auth, emailForFirebase, pass);
      const profile = await fetchUserProfile(cred.user);
      if (!profile.active) {
        await fbSignOut(auth).catch(() => {});
        throw new Error('Tu cuenta ha sido suspendida por el Administrador.');
      }
      sessionStorage.removeItem(ACTIVE_SESSION_KEY);
      sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);
      setCurrentUser(cred.user);
      setUserProfile(profile);
      recordAuditLog(profile, 'LOGIN', { changes: 'Inicio de sesión con credenciales' });
      return;
    } catch (error: any) {
      // If Firebase Auth explicitly said suspended, rethrow immediately
      if (error?.message?.includes('suspendida')) {
        throw error;
      }

      // Authenticate against Admin-created seller credentials directory
      const localAuth = await authenticateLocalUser(trimmed, pass);
      if (localAuth && 'user' in localAuth) {
        sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);
        sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(localAuth.user));
        setCurrentUser(null);
        setUserProfile(localAuth.user);
        recordAuditLog(localAuth.user, 'LOGIN', {
          changes: `Inicio de sesión de vendedor: ${localAuth.user.fullName}`
        });
        return;
      }

      if (localAuth && 'error' in localAuth) {
        throw new Error(localAuth.error);
      }

      throw new Error(
        'Usuario, correo o contraseña incorrectos. Verifica las credenciales asignadas por el Administrador.'
      );
    }
  };

  const registerWithEmail = async (email: string, pass: string, fullName: string) => {
    setSessionNotice(null);
    const cleanEmail = (
      email.includes('@') ? email.trim() : `${email.trim().toLowerCase()}@clientespro.do`
    ).toLowerCase();
    const cleanName = fullName.trim();
    const cleanUsername = cleanEmail.split('@')[0].replace(/[^a-z0-9_]/g, '') || 'vendedor';
    const isBootstrap = cleanEmail === BOOTSTRAP_ADMIN_EMAIL;
    const assignedRole: UserRole = isBootstrap ? 'admin' : 'seller';

    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
      const userRef = doc(db, 'users', cred.user.uid);
      const newProfile: UserProfile = stripUndefined({
        uid: cred.user.uid,
        fullName: cleanName,
        username: cleanUsername,
        email: cleanEmail,
        role: assignedRole,
        adminId: assignedRole === 'admin' ? null : DEFAULT_ADMIN_PROFILE.uid,
        adminName: assignedRole === 'admin' ? null : DEFAULT_ADMIN_PROFILE.fullName,
        active: true,
        createdAt: new Date().toISOString()
      });
      await setDoc(userRef, newProfile);
      const passwordHash = await hashPassword(pass);
      upsertLocalDirectoryUser({ ...newProfile, passwordHash });
      sessionStorage.removeItem(ACTIVE_SESSION_KEY);
      sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);
      setCurrentUser(cred.user);
      setUserProfile(newProfile);
      recordAuditLog(newProfile, 'USUARIO_CREADO', { changes: `Vendedor registrado: ${cleanName} (${cleanEmail})` });
    } catch (error: any) {
      if (error?.code === 'auth/operation-not-allowed' || error?.message?.includes('operation-not-allowed')) {
        const existing = findLocalDirectoryUserByIdentifier(cleanEmail);
        if (existing) {
          throw new Error('Este correo electrónico ya está registrado. Inicia sesión con tus credenciales.');
        }

        const newUid = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const passwordHash = await hashPassword(pass);
        const newProfile: UserProfile = {
          uid: newUid,
          fullName: cleanName,
          username: cleanUsername,
          email: cleanEmail,
          role: assignedRole,
          adminId: assignedRole === 'admin' ? null : DEFAULT_ADMIN_PROFILE.uid,
          adminName: assignedRole === 'admin' ? null : DEFAULT_ADMIN_PROFILE.fullName,
          active: true,
          createdAt: new Date().toISOString()
        };

        upsertLocalDirectoryUser({ ...newProfile, passwordHash });
        sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);
        sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(newProfile));
        setCurrentUser(null);
        setUserProfile(newProfile);
        recordAuditLog(newProfile, 'USUARIO_CREADO', {
          changes: `Vendedor registrado: ${cleanName} (${cleanEmail})`
        });
        return;
      }
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const logout = async () => {
    if (userProfile) {
      recordAuditLog(userProfile, 'LOGIN', { changes: 'Cierre de sesión' });
      const activeUid = currentUser?.uid || userProfile.uid;
      writeLocalPresenceHeartbeat(activeUid, userProfile.fullName, userProfile.role, false, userProfile.adminId);
    }
    if (auth.currentUser && userProfile) {
      await writePresenceHeartbeat(
        auth.currentUser.uid,
        userProfile.fullName,
        userProfile.role,
        false
      ).catch(() => {});
    }
    sessionStorage.setItem(EXPLICIT_LOGOUT_KEY, 'true');
    sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    if (currentUser) {
      await fbSignOut(auth).catch(() => {});
    }
    setCurrentUser(null);
    setUserProfile(null);
  };

  const refreshProfile = async () => {
    if (currentUser) {
      const profile = await fetchUserProfile(currentUser);
      setUserProfile(profile);
    }
  };

  const activeRole: UserRole = userProfile?.role === 'admin' ? 'admin' : 'seller';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        sessionNotice,
        clearSessionNotice,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        resetPassword,
        logout,
        activeRole,
        refreshProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
