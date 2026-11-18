import React, { createContext, useContext, useEffect, useState } from 'react';
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
import { auth, googleProvider, db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { recordAuditLog } from '../lib/audit';
import { writePresenceHeartbeat } from '../lib/presence';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, fullName: string, role?: UserRole) => Promise<void>;
  loginAsDemo: (role: UserRole) => void;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  switchSimulatedRole: (role: UserRole | null) => void;
  activeRole: UserRole;
  isSimulating: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const BOOTSTRAP_ADMIN_EMAIL = 'luismpompelis@gmail.com';
const DEMO_SESSION_KEY = 'clientes_pro_demo_session';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulatedRole, setSimulatedRole] = useState<UserRole | null>(null);

  // Sync profile from Firestore
  const fetchUserProfile = async (user: FirebaseUser): Promise<UserProfile> => {
    const userRef = doc(db, 'users', user.uid);
    try {
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        // Check if bootstrap admin
        if (user.email && user.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL && data.role !== 'admin') {
          await updateDoc(userRef, { role: 'admin' });
          return { ...data, role: 'admin' };
        }
        return data;
      } else {
        // Create initial profile
        const isDefaultAdmin = user.email ? user.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL : false;
        const initialProfile: UserProfile = {
          uid: user.uid,
          fullName: user.displayName || user.email?.split('@')[0] || 'Usuario',
          username: (user.email?.split('@')[0] || 'usuario').toLowerCase().replace(/[^a-z0-9_]/g, ''),
          email: user.email || `${user.uid}@clientespro.do`,
          role: isDefaultAdmin ? 'admin' : 'seller',
          active: true,
          supervisorId: null,
          createdAt: new Date().toISOString()
        };
        try {
          await setDoc(userRef, initialProfile);
        } catch (e) {
          console.warn('Could not write profile to Firestore:', e);
        }
        return initialProfile;
      }
    } catch (err) {
      console.warn('Could not read user profile from Firestore, using local fallback:', err);
      const isDefaultAdmin = user.email ? user.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL : false;
      return {
        uid: user.uid,
        fullName: user.displayName || 'Usuario',
        username: user.email?.split('@')[0] || 'usuario',
        email: user.email || 'offline@clientespro.do',
        role: isDefaultAdmin ? 'admin' : 'seller',
        active: true,
        createdAt: new Date().toISOString()
      };
    }
  };

  useEffect(() => {
    const savedDemo = localStorage.getItem(DEMO_SESSION_KEY);
    const explicitlyLoggedOut = localStorage.getItem('logged_out_explicitly') === 'true';
    let initialDemoProfile: UserProfile | null = null;
    
    if (savedDemo) {
      try {
        initialDemoProfile = JSON.parse(savedDemo);
      } catch {
        localStorage.removeItem(DEMO_SESSION_KEY);
      }
    } else if (!explicitlyLoggedOut) {
      // Default to Administrator owner workspace on first visit for zero-friction launch
      initialDemoProfile = {
        uid: 'admin_luis_owner',
        fullName: 'Luis M. Pompelis',
        username: 'luispompelis',
        email: 'LuisMPompelis@gmail.com',
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString()
      };
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        localStorage.removeItem(DEMO_SESSION_KEY);
        localStorage.removeItem('logged_out_explicitly');
        try {
          const profile = await fetchUserProfile(user);
          setUserProfile(profile);
        } catch (e) {
          console.error('Error fetching profile:', e);
        }
      } else if (initialDemoProfile) {
        setUserProfile(initialDemoProfile);
      } else {
        setUserProfile(null);
        setSimulatedRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    try {
      localStorage.removeItem(DEMO_SESSION_KEY);
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        const profile = await fetchUserProfile(result.user);
        setUserProfile(profile);
        recordAuditLog(profile, 'LOGIN', { changes: 'Inicio de sesión con Google' });
      }
    } catch (error: any) {
      console.error('Google sign in error:', error);
      throw error;
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      localStorage.removeItem(DEMO_SESSION_KEY);
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const profile = await fetchUserProfile(cred.user);
      setUserProfile(profile);
      recordAuditLog(profile, 'LOGIN', { changes: 'Inicio de sesión con credenciales' });
    } catch (error: any) {
      console.error('Email sign in error:', error);
      if (error?.code === 'auth/operation-not-allowed' || error?.message?.includes('operation-not-allowed')) {
        throw new Error(
          'El proveedor de Correo/Contraseña no está habilitado en la consola de Firebase. ' +
          'Por favor utiliza "Continuar con Cuenta Google" o los botones de "Acceso Rápido de Prueba (Demo)" abajo.'
        );
      }
      throw error;
    }
  };

  const registerWithEmail = async (email: string, pass: string, fullName: string, role: UserRole = 'seller') => {
    try {
      localStorage.removeItem(DEMO_SESSION_KEY);
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const userRef = doc(db, 'users', cred.user.uid);
      const newProfile: UserProfile = {
        uid: cred.user.uid,
        fullName,
        username: email.split('@')[0].toLowerCase(),
        email,
        role: email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL ? 'admin' : role,
        active: true,
        createdAt: new Date().toISOString()
      };
      await setDoc(userRef, newProfile);
      setUserProfile(newProfile);
      recordAuditLog(newProfile, 'USUARIO_CREADO', { changes: `Usuario registrado: ${email}` });
    } catch (error: any) {
      console.error('Register error:', error);
      if (error?.code === 'auth/operation-not-allowed' || error?.message?.includes('operation-not-allowed')) {
        throw new Error(
          'El proveedor de Correo/Contraseña no está habilitado en Firebase. ' +
          'Por favor utiliza el botón de Google o los botones de Demo.'
        );
      }
      throw error;
    }
  };

  const loginAsDemo = (demoRole: UserRole) => {
    const demoProfiles: Record<UserRole, UserProfile> = {
      admin: {
        uid: 'demo_admin_luis',
        fullName: 'Luis Pompelis (Administrador Principal)',
        username: 'luis_admin',
        email: 'luismpompelis@gmail.com',
        role: 'admin',
        active: true,
        createdAt: new Date().toISOString()
      },
      supervisor: {
        uid: 'demo_supervisor_roberto',
        fullName: 'Lic. Roberto Almonte (Supervisor)',
        username: 'ralmonte',
        email: 'supervisor.rd@clientespro.do',
        role: 'supervisor',
        active: true,
        createdAt: new Date().toISOString()
      },
      seller: {
        uid: 'demo_seller_carlos',
        fullName: 'Carlos Manuel Gómez (Vendedor)',
        username: 'cgomez',
        email: 'carlos.gomez@clientespro.do',
        role: 'seller',
        active: true,
        supervisorId: 'demo_supervisor_roberto',
        createdAt: new Date().toISOString()
      }
    };

    const selectedProfile = demoProfiles[demoRole];
    localStorage.removeItem('logged_out_explicitly');
    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(selectedProfile));
    setUserProfile(selectedProfile);
    setSimulatedRole(null);
    recordAuditLog(selectedProfile, 'LOGIN', { changes: `Inicio de sesión en modo Demo (${demoRole})` });
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const logout = async () => {
    if (userProfile) {
      recordAuditLog(userProfile, 'LOGIN', { changes: 'Cierre de sesión' });
    }
    if (auth.currentUser && userProfile) {
      await writePresenceHeartbeat(
        auth.currentUser.uid,
        userProfile.fullName,
        userProfile.role,
        false
      ).catch(() => {});
    }
    localStorage.setItem('logged_out_explicitly', 'true');
    localStorage.removeItem(DEMO_SESSION_KEY);
    await fbSignOut(auth).catch(() => {});
    setCurrentUser(null);
    setUserProfile(null);
    setSimulatedRole(null);
  };

  const switchSimulatedRole = (role: UserRole | null) => {
    setSimulatedRole(role);
  };

  const refreshProfile = async () => {
    if (currentUser) {
      const profile = await fetchUserProfile(currentUser);
      setUserProfile(profile);
    }
  };

  const activeRole: UserRole = simulatedRole || userProfile?.role || 'seller';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        loginAsDemo,
        resetPassword,
        logout,
        switchSimulatedRole,
        activeRole,
        isSimulating: simulatedRole !== null,
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
