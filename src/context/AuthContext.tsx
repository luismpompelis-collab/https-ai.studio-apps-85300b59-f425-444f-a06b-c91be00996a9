import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db, stripUndefined, OperationType } from '../lib/firebase';
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
  isLocalPlaceholderUid,
  sanitizeRole,
  stripPasswordHash,
  syncLocalSellersToFirestore,
  upsertLocalDirectoryUser
} from '../lib/sellerDirectory';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isFirebaseConnected: boolean;
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

function buildCleanUserProfile(raw: Partial<UserProfile> & { uid: string; email: string }, role: UserRole): UserProfile {
  const cleanEmail = (raw.email || `${raw.uid}@clientespro.do`).trim().toLowerCase().slice(0, 120);
  const fallbackName = cleanEmail.split('@')[0] || (role === 'admin' ? DEFAULT_ADMIN_PROFILE.fullName : 'Vendedor');
  const cleanFullName = (raw.fullName || fallbackName).trim().slice(0, 150) || 'Vendedor';
  const cleanUsername = (
    raw.username ||
    cleanEmail.split('@')[0].replace(/[^a-z0-9._-]/g, '') ||
    'usuario'
  )
    .trim()
    .toLowerCase()
    .slice(0, 60);

  return stripUndefined({
    uid: raw.uid.slice(0, 128),
    fullName: cleanFullName,
    username: cleanUsername,
    email: cleanEmail,
    role,
    adminId: role === 'admin' ? null : (raw.adminId || DEFAULT_ADMIN_PROFILE.uid).slice(0, 128),
    adminName: role === 'admin' ? null : (raw.adminName || DEFAULT_ADMIN_PROFILE.fullName).slice(0, 150),
    active: raw.active !== false,
    ...(raw.phone ? { phone: String(raw.phone).slice(0, 30) } : {}),
    createdAt: (raw.createdAt || new Date().toISOString()).slice(0, 50),
    ...(raw.updatedAt ? { updatedAt: String(raw.updatedAt).slice(0, 50) } : {})
  });
}

function logFirestoreWarning(error: unknown, operationType: OperationType, path: string) {
  console.warn(
    'Firestore warning:',
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      operationType,
      path,
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null
    })
  );
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  // Prevents onAuthStateChanged from racing with active login/register/logout actions
  const authActionInProgressRef = useRef(false);

  const clearSessionNotice = useCallback(() => setSessionNotice(null), []);

  const readSavedTabSession = useCallback((): UserProfile | null => {
    const savedSession = sessionStorage.getItem(ACTIVE_SESSION_KEY);
    if (!savedSession) return null;

    try {
      const parsed = JSON.parse(savedSession) as UserProfile;
      const sanitizedRole = sanitizeRole(parsed.role);
      const sanitized = buildCleanUserProfile(
        { ...parsed, uid: parsed.uid || 'usr_session', email: parsed.email || 'usuario@clientespro.do' },
        sanitizedRole
      );

      if (sanitized.role === 'seller') {
        const latest = getLocalDirectoryUsers().find(
          (u) => u.uid === sanitized.uid || u.email.toLowerCase() === sanitized.email.toLowerCase()
        );
        if (latest) {
          if (latest.active === false) {
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
      return null;
    }
  }, []);

  // Sync profile from Firestore (including claiming Admin-created seller invites)
  const fetchUserProfile = useCallback(async (user: FirebaseUser): Promise<UserProfile> => {
    const userRef = doc(db, 'users', user.uid);
    const userEmail = (user.email || `${user.uid}@clientespro.do`).toLowerCase();
    const isDefaultAdmin = userEmail === BOOTSTRAP_ADMIN_EMAIL;

    try {
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const raw = snap.data() as Partial<UserProfile>;
        const normalizedRole: UserRole = isDefaultAdmin ? 'admin' : sanitizeRole(raw.role);
        const profile = buildCleanUserProfile(
          {
            ...raw,
            uid: user.uid,
            email: raw.email || userEmail,
            fullName:
              raw.fullName ||
              user.displayName ||
              (isDefaultAdmin ? DEFAULT_ADMIN_PROFILE.fullName : userEmail.split('@')[0]),
            active: raw.active !== false
          },
          normalizedRole
        );

        // Normalize legacy documents (e.g., missing active field or legacy role) without failing login
        if (raw.role !== normalizedRole || raw.active === undefined) {
          await setDoc(userRef, profile).catch((e) =>
            logFirestoreWarning(e, OperationType.UPDATE, `users/${user.uid}`)
          );
        }

        upsertLocalDirectoryUser({
          ...profile,
          firebaseSynced: true,
          firebaseAuthCreated: true
        });
        return profile;
      }

      // Check if the Administrator pre-created a seller invite for this email
      if (user.email && !isDefaultAdmin) {
        try {
          const inviteRef = doc(db, 'seller_invites', emailToInviteId(user.email));
          const inviteSnap = await getDoc(inviteRef);
          if (inviteSnap.exists()) {
            const invite = inviteSnap.data() as Partial<UserProfile>;
            const claimedProfile = buildCleanUserProfile(
              {
                uid: user.uid,
                fullName: invite.fullName || user.displayName || userEmail.split('@')[0] || 'Vendedor',
                username: invite.username,
                email: userEmail,
                adminId: invite.adminId || DEFAULT_ADMIN_PROFILE.uid,
                adminName: invite.adminName || DEFAULT_ADMIN_PROFILE.fullName,
                active: invite.active !== false,
                createdAt: invite.createdAt || new Date().toISOString()
              },
              'seller'
            );

            // Only create Firestore /users doc if invite is active (rules require active == true on self-create)
            if (claimedProfile.active) {
              await setDoc(userRef, claimedProfile).catch((e) =>
                logFirestoreWarning(e, OperationType.CREATE, `users/${user.uid}`)
              );
            }

            upsertLocalDirectoryUser({
              ...claimedProfile,
              firebaseSynced: true,
              firebaseAuthCreated: true
            });
            return claimedProfile;
          }
        } catch (inviteErr) {
          logFirestoreWarning(inviteErr, OperationType.GET, `seller_invites/${emailToInviteId(user.email)}`);
        }
      }

      // Check local directory in case Admin created this seller in the same browser
      const localMatch = user.email ? findLocalDirectoryUserByIdentifier(user.email) : null;
      const role: UserRole = isDefaultAdmin ? 'admin' : 'seller';

      const initialProfile = buildCleanUserProfile(
        {
          uid: user.uid,
          fullName:
            localMatch?.fullName ||
            user.displayName ||
            (isDefaultAdmin ? DEFAULT_ADMIN_PROFILE.fullName : userEmail.split('@')[0]),
          username: localMatch?.username,
          email: userEmail,
          adminId: isDefaultAdmin ? null : localMatch?.adminId || DEFAULT_ADMIN_PROFILE.uid,
          adminName: isDefaultAdmin ? null : localMatch?.adminName || DEFAULT_ADMIN_PROFILE.fullName,
          active: localMatch ? localMatch.active !== false : true,
          createdAt: localMatch?.createdAt || new Date().toISOString()
        },
        role
      );

      if (initialProfile.active) {
        await setDoc(userRef, initialProfile).catch((e) =>
          logFirestoreWarning(e, OperationType.CREATE, `users/${user.uid}`)
        );
      }

      upsertLocalDirectoryUser({
        ...initialProfile,
        firebaseSynced: true,
        firebaseAuthCreated: true
      });
      return initialProfile;
    } catch (err) {
      logFirestoreWarning(err, OperationType.GET, `users/${user.uid}`);
      const localMatch = user.email ? findLocalDirectoryUserByIdentifier(user.email) : null;
      const role: UserRole = isDefaultAdmin ? 'admin' : 'seller';
      return buildCleanUserProfile(
        {
          uid: user.uid,
          fullName:
            localMatch?.fullName ||
            user.displayName ||
            (isDefaultAdmin ? DEFAULT_ADMIN_PROFILE.fullName : userEmail.split('@')[0]),
          username: localMatch?.username,
          email: userEmail,
          adminId: isDefaultAdmin ? null : localMatch?.adminId || DEFAULT_ADMIN_PROFILE.uid,
          adminName: isDefaultAdmin ? null : localMatch?.adminName || DEFAULT_ADMIN_PROFILE.fullName,
          active: localMatch ? localMatch.active !== false : true,
          createdAt: localMatch?.createdAt || new Date().toISOString()
        },
        role
      );
    }
  }, []);

  // Boot auth state & per-tab session restoration (never uses stale mount closures)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Let explicit login/register/logout handlers finish atomically without racing
      if (authActionInProgressRef.current) {
        return;
      }

      const explicitlyLoggedOut = sessionStorage.getItem(EXPLICIT_LOGOUT_KEY) === 'true';
      const savedTabSession = readSavedTabSession();

      // If this tab explicitly logged into a credential-based seller session, keep this tab isolated
      if (
        savedTabSession &&
        savedTabSession.role === 'seller' &&
        (!user || user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL)
      ) {
        setCurrentUser(null);
        setUserProfile(savedTabSession);
        setLoading(false);
        return;
      }

      if (user && !explicitlyLoggedOut) {
        try {
          const profile = await fetchUserProfile(user);
          // Re-check in case user clicked logout while profile was fetching
          if (authActionInProgressRef.current || sessionStorage.getItem(EXPLICIT_LOGOUT_KEY) === 'true') {
            return;
          }

          if (profile.active === false) {
            await fbSignOut(auth).catch(() => {});
            sessionStorage.removeItem(ACTIVE_SESSION_KEY);
            sessionStorage.setItem(EXPLICIT_LOGOUT_KEY, 'true');
            setCurrentUser(null);
            setUserProfile(null);
            setSessionNotice('Tu cuenta ha sido suspendida por el Administrador.');
          } else {
            sessionStorage.removeItem(ACTIVE_SESSION_KEY);
            sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);
            setCurrentUser(user);
            setUserProfile(profile);
            if (profile.role === 'admin') {
              syncLocalSellersToFirestore(profile.uid, profile.fullName).catch(() => {});
            }
          }
        } catch (e) {
          console.error('Error fetching profile:', e);
        }
      } else if (savedTabSession) {
        setCurrentUser(null);
        setUserProfile(savedTabSession);
      } else if (!explicitlyLoggedOut) {
        sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(DEFAULT_ADMIN_PROFILE));
        setCurrentUser(null);
        setUserProfile(DEFAULT_ADMIN_PROFILE);
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchUserProfile, readSavedTabSession]);

  // Keep active local seller profile synchronized if Admin edits name or suspends account in another tab
  useEffect(() => {
    if (currentUser || !userProfile || userProfile.role !== 'seller') return;

    const syncFromDirectory = () => {
      const latest = getLocalDirectoryUsers().find(
        (u) => u.uid === userProfile.uid || u.email.toLowerCase() === userProfile.email.toLowerCase()
      );
      if (!latest) return;

      if (latest.active === false) {
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
    const prevLoggedOut = sessionStorage.getItem(EXPLICIT_LOGOUT_KEY);
    const prevTabSession = sessionStorage.getItem(ACTIVE_SESSION_KEY);
    authActionInProgressRef.current = true;

    // Clear logout flag BEFORE popup so onAuthStateChanged never kicks the user out
    sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        const profile = await fetchUserProfile(result.user);
        if (profile.active === false) {
          await fbSignOut(auth).catch(() => {});
          sessionStorage.setItem(EXPLICIT_LOGOUT_KEY, 'true');
          setCurrentUser(null);
          setUserProfile(null);
          throw new Error('Tu cuenta ha sido suspendida por el Administrador.');
        }
        setCurrentUser(result.user);
        setUserProfile(profile);
        if (profile.role === 'admin') {
          syncLocalSellersToFirestore(profile.uid, profile.fullName).catch(() => {});
        }
        recordAuditLog(profile, 'LOGIN', { changes: 'Inicio de sesión con Google' });
      }
    } catch (err) {
      if (!auth.currentUser) {
        if (prevTabSession) sessionStorage.setItem(ACTIVE_SESSION_KEY, prevTabSession);
        if (prevLoggedOut) sessionStorage.setItem(EXPLICIT_LOGOUT_KEY, prevLoggedOut);
      }
      throw err;
    } finally {
      authActionInProgressRef.current = false;
    }
  };

  const loginWithEmail = async (identifier: string, pass: string) => {
    setSessionNotice(null);
    const trimmed = identifier.trim();
    if (!trimmed || !pass) {
      throw new Error('Ingresa tu usuario o correo y tu contraseña.');
    }

    const prevLoggedOut = sessionStorage.getItem(EXPLICIT_LOGOUT_KEY);
    const prevTabSession = sessionStorage.getItem(ACTIVE_SESSION_KEY);
    authActionInProgressRef.current = true;

    try {
      // Resolve actual email if user typed their username
      const localCandidate = findLocalDirectoryUserByIdentifier(trimmed);

      // If this seller was provisioned locally without a Firebase Auth UID, authenticate directly
      if (
        localCandidate &&
        isLocalPlaceholderUid(localCandidate.uid) &&
        !localCandidate.firebaseAuthCreated
      ) {
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

      // Clear logout flag BEFORE calling Firebase Auth so onAuthStateChanged never kicks the user out
      sessionStorage.removeItem(ACTIVE_SESSION_KEY);
      sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);

      try {
        const cred = await signInWithEmailAndPassword(auth, emailForFirebase, pass);
        const profile = await fetchUserProfile(cred.user);
        if (profile.active === false) {
          await fbSignOut(auth).catch(() => {});
          sessionStorage.setItem(EXPLICIT_LOGOUT_KEY, 'true');
          setCurrentUser(null);
          setUserProfile(null);
          throw new Error('Tu cuenta ha sido suspendida por el Administrador.');
        }
        setCurrentUser(cred.user);
        setUserProfile(profile);
        if (profile.role === 'admin') {
          syncLocalSellersToFirestore(profile.uid, profile.fullName).catch(() => {});
        }
        recordAuditLog(profile, 'LOGIN', { changes: 'Inicio de sesión con credenciales' });
        return;
      } catch (error: any) {
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

        if (prevTabSession) sessionStorage.setItem(ACTIVE_SESSION_KEY, prevTabSession);
        if (prevLoggedOut) sessionStorage.setItem(EXPLICIT_LOGOUT_KEY, prevLoggedOut);

        if (localAuth && 'error' in localAuth) {
          throw new Error(localAuth.error);
        }

        throw new Error(
          'Usuario, correo o contraseña incorrectos. Verifica las credenciales asignadas por el Administrador.'
        );
      }
    } finally {
      authActionInProgressRef.current = false;
    }
  };

  const registerWithEmail = async (email: string, pass: string, fullName: string) => {
    setSessionNotice(null);
    const cleanEmail = (
      email.includes('@') ? email.trim() : `${email.trim().toLowerCase()}@clientespro.do`
    )
      .toLowerCase()
      .slice(0, 120);
    const cleanName = fullName.trim().slice(0, 150);
    const cleanUsername = (cleanEmail.split('@')[0].replace(/[^a-z0-9._-]/g, '') || 'vendedor').slice(0, 60);
    const isBootstrap = cleanEmail === BOOTSTRAP_ADMIN_EMAIL;
    const assignedRole: UserRole = isBootstrap ? 'admin' : 'seller';

    const prevLoggedOut = sessionStorage.getItem(EXPLICIT_LOGOUT_KEY);
    const prevTabSession = sessionStorage.getItem(ACTIVE_SESSION_KEY);
    authActionInProgressRef.current = true;

    // Clear logout flag BEFORE creating Firebase Auth user so onAuthStateChanged never kicks the user out
    sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);

    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
      const userRef = doc(db, 'users', cred.user.uid);
      const newProfile = buildCleanUserProfile(
        {
          uid: cred.user.uid,
          fullName: cleanName,
          username: cleanUsername,
          email: cleanEmail,
          adminId: assignedRole === 'admin' ? null : DEFAULT_ADMIN_PROFILE.uid,
          adminName: assignedRole === 'admin' ? null : DEFAULT_ADMIN_PROFILE.fullName,
          active: true,
          createdAt: new Date().toISOString()
        },
        assignedRole
      );
      await setDoc(userRef, newProfile).catch((e) =>
        logFirestoreWarning(e, OperationType.CREATE, `users/${cred.user.uid}`)
      );
      const passwordHash = await hashPassword(pass);
      upsertLocalDirectoryUser({
        ...newProfile,
        passwordHash,
        firebaseSynced: true,
        firebaseAuthCreated: true
      });
      setCurrentUser(cred.user);
      setUserProfile(newProfile);
      recordAuditLog(newProfile, 'USUARIO_CREADO', {
        changes: `Vendedor registrado: ${cleanName} (${cleanEmail})`
      });
    } catch (error: any) {
      if (error?.code === 'auth/operation-not-allowed' || error?.message?.includes('operation-not-allowed')) {
        const existing = findLocalDirectoryUserByIdentifier(cleanEmail);
        if (existing) {
          if (prevTabSession) sessionStorage.setItem(ACTIVE_SESSION_KEY, prevTabSession);
          if (prevLoggedOut) sessionStorage.setItem(EXPLICIT_LOGOUT_KEY, prevLoggedOut);
          throw new Error('Este correo electrónico ya está registrado. Inicia sesión con tus credenciales.');
        }

        const newUid = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const passwordHash = await hashPassword(pass);
        const newProfile = buildCleanUserProfile(
          {
            uid: newUid,
            fullName: cleanName,
            username: cleanUsername,
            email: cleanEmail,
            adminId: assignedRole === 'admin' ? null : DEFAULT_ADMIN_PROFILE.uid,
            adminName: assignedRole === 'admin' ? null : DEFAULT_ADMIN_PROFILE.fullName,
            active: true,
            createdAt: new Date().toISOString()
          },
          assignedRole
        );

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

      if (prevTabSession) sessionStorage.setItem(ACTIVE_SESSION_KEY, prevTabSession);
      if (prevLoggedOut) sessionStorage.setItem(EXPLICIT_LOGOUT_KEY, prevLoggedOut);
      throw error;
    } finally {
      authActionInProgressRef.current = false;
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const logout = async () => {
    authActionInProgressRef.current = true;
    try {
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
      if (currentUser || auth.currentUser) {
        await fbSignOut(auth).catch(() => {});
      }
      setCurrentUser(null);
      setUserProfile(null);
    } finally {
      authActionInProgressRef.current = false;
    }
  };

  const refreshProfile = async () => {
    if (currentUser) {
      const profile = await fetchUserProfile(currentUser);
      setUserProfile(profile);
    }
  };

  const activeRole: UserRole = userProfile?.role === 'admin' ? 'admin' : 'seller';
  const isFirebaseConnected = Boolean(currentUser);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        isFirebaseConnected,
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
