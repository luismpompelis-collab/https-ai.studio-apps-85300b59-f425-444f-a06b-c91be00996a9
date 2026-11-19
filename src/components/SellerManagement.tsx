import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { usePresence } from '../context/PresenceContext';
import { isPresenceActive } from '../lib/presence';
import { UserProfile, UserRole } from '../types';
import { collection, doc, getDocs, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db, stripUndefined } from '../lib/firebase';
import { recordAuditLog } from '../lib/audit';
import {
  SELLERS_DIRECTORY_KEY,
  SELLERS_SYNC_CHANNEL,
  deduplicateUsersByEmail,
  emailToInviteId,
  findLocalDirectoryUserByIdentifier,
  getLocalDirectoryUsers,
  hashPassword,
  isLocalPlaceholderUid,
  sanitizeRole,
  stripPasswordHash,
  syncLocalSellersToFirestore,
  syncRemoteUsersToLocalDirectory,
  tryCreateFirebaseAuthSeller,
  upsertLocalDirectoryUser
} from '../lib/sellerDirectory';
import {
  Shield,
  UserPlus,
  CheckCircle2,
  XCircle,
  Edit2,
  Search,
  AlertCircle,
  Radio,
  Users,
  Link2,
  Copy,
  Check,
  KeyRound,
  Cloud,
  CloudOff
} from 'lucide-react';
import { formatDominicanDateTime } from '../lib/dominicanValidation';

export const SellerManagement: React.FC = () => {
  const { currentUser, userProfile, isFirebaseConnected, loginWithGoogle } = useAuth();
  const { allClients } = useSync();
  const {
    connectedSellers,
    totalConnectedSellers,
    presenceByUid,
    nowMs
  } = usePresence();

  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('seller');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'error' | 'success';
    text: string;
    credentials?: { fullName: string; username: string; email: string };
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);
  const [confirmToggleUid, setConfirmToggleUid] = useState<string | null>(null);

  const [connectingFirebase, setConnectingFirebase] = useState(false);

  const adminUid = currentUser?.uid || userProfile?.uid || 'admin_luis_owner';
  const adminName = userProfile?.fullName || 'Luis M. Pompelis';

  const loadLocalView = useCallback((): UserProfile[] => {
    const dir = getLocalDirectoryUsers().map(stripPasswordHash);
    const list: UserProfile[] = [];
    if (userProfile) {
      list.push({ ...userProfile, role: sanitizeRole(userProfile.role) });
    }
    list.push(...dir);
    return deduplicateUsersByEmail(list).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [userProfile]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      if (!currentUser) {
        setUsersList(loadLocalView());
        return;
      }

      const snap = await getDocs(collection(db, 'users'));
      const remoteList: UserProfile[] = [];
      snap.forEach((d) => {
        const data = d.data() as UserProfile;
        remoteList.push({
          ...data,
          role: sanitizeRole(data.role)
        });
      });

      const merged = syncRemoteUsersToLocalDirectory(remoteList).map(stripPasswordHash);
      if (userProfile) {
        merged.unshift(userProfile);
      }
      const unique = deduplicateUsersByEmail(merged).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setUsersList(unique);
    } catch (err) {
      console.warn('Error fetching users, using local directory:', err);
      setUsersList(loadLocalView());
    } finally {
      setLoading(false);
    }
  }, [currentUser, userProfile, loadLocalView]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Real-time Firestore listener so newly connected sellers appear immediately
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const remoteList: UserProfile[] = [];
        snap.forEach((d) => {
          const data = d.data() as UserProfile;
          remoteList.push({
            ...data,
            role: sanitizeRole(data.role)
          });
        });
        const merged = syncRemoteUsersToLocalDirectory(remoteList).map(stripPasswordHash);
        if (userProfile) {
          merged.unshift(userProfile);
        }
        const unique = deduplicateUsersByEmail(merged).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setUsersList(unique);
        setLoading(false);
      },
      (err) => {
        console.warn('Error en escucha en vivo de usuarios Firestore:', err);
      }
    );

    return () => unsubscribe();
  }, [currentUser, userProfile]);

  const handleConnectAdminFirebase = async () => {
    setConnectingFirebase(true);
    try {
      await loginWithGoogle();
      setActionFeedback({
        type: 'success',
        text: 'Administrador conectado a Firebase. Los vendedores y expedientes ahora se sincronizan en tiempo real con Firestore.'
      });
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        text: err?.message || 'No se pudo conectar con Firebase.'
      });
    } finally {
      setConnectingFirebase(false);
    }
  };

  // Listen for seller updates across tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SELLERS_DIRECTORY_KEY) {
        setUsersList(loadLocalView());
      }
    };
    window.addEventListener('storage', handleStorage);

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(SELLERS_SYNC_CHANNEL);
        channel.onmessage = () => setUsersList(loadLocalView());
      }
    } catch {
      channel = null;
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (channel) channel.close();
    };
  }, [loadLocalView]);

  // Client count per user
  const clientCountMap = React.useMemo(() => {
    const map = new Map<string, number>();
    allClients.forEach((c) => {
      if (!c.deletedAt && c.sellerId) {
        map.set(c.sellerId, (map.get(c.sellerId) || 0) + 1);
      }
    });
    return map;
  }, [allClients]);

  const totalSellersCount = React.useMemo(
    () => usersList.filter((u) => u.role === 'seller').length,
    [usersList]
  );

  // Create or Update Seller / User
  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanFullName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const derivedUsername =
      username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') ||
      cleanEmail.split('@')[0].replace(/[^a-z0-9._-]/g, '') ||
      'vendedor';

    if (!cleanFullName || !cleanEmail) {
      setFormError('El nombre completo y el correo electrónico son requeridos.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingUser) {
        if (password && password.length < 6) {
          setFormError('La nueva contraseña debe tener al menos 6 caracteres.');
          setIsSubmitting(false);
          return;
        }

        const now = new Date().toISOString();
        const updatedFields = stripUndefined({
          fullName: cleanFullName,
          username: derivedUsername,
          role,
          adminId: role === 'admin' ? null : editingUser.adminId || adminUid,
          adminName: role === 'admin' ? null : editingUser.adminName || adminName,
          updatedAt: now
        });

        const nextPasswordHash = password ? await hashPassword(password) : undefined;

        upsertLocalDirectoryUser({
          ...editingUser,
          ...updatedFields,
          ...(nextPasswordHash ? { passwordHash: nextPasswordHash } : {})
        });

        if (currentUser) {
          await updateDoc(doc(db, 'users', editingUser.uid), updatedFields).catch(() => {});
          if (role === 'seller') {
            await setDoc(
              doc(db, 'seller_invites', emailToInviteId(editingUser.email)),
              stripUndefined({
                fullName: cleanFullName,
                username: derivedUsername,
                email: editingUser.email.toLowerCase(),
                role: 'seller',
                adminId: editingUser.adminId || adminUid,
                adminName: editingUser.adminName || adminName,
                active: editingUser.active,
                createdAt: editingUser.createdAt,
                updatedAt: now
              })
            ).catch(() => {});
          }
        }

        if (userProfile) {
          recordAuditLog(userProfile, 'USUARIO_ESTADO', {
            changes: `Actualización de ${role === 'admin' ? 'administrador' : 'vendedor'}: ${cleanFullName}`
          });
        }

        setActionFeedback({
          type: 'success',
          text: `Datos de ${cleanFullName} actualizados correctamente.`
        });
      } else {
        if (!password || password.length < 6) {
          setFormError('La contraseña de acceso debe tener al menos 6 caracteres.');
          setIsSubmitting(false);
          return;
        }

        // Check for duplicate email or username
        const existingByEmail = findLocalDirectoryUserByIdentifier(cleanEmail);
        const existingByUser = findLocalDirectoryUserByIdentifier(derivedUsername);
        if (existingByEmail || usersList.some((u) => u.email.toLowerCase() === cleanEmail)) {
          setFormError('Ya existe un usuario registrado con ese correo electrónico.');
          setIsSubmitting(false);
          return;
        }
        if (existingByUser || usersList.some((u) => (u.username || '').toLowerCase() === derivedUsername)) {
          setFormError('Ese nombre de usuario ya está en uso. Elige otro.');
          setIsSubmitting(false);
          return;
        }

        const now = new Date().toISOString();
        const passwordHash = await hashPassword(password);

        // Always attempt creating a real Firebase Auth + Firestore user using a secondary app
        // so the new seller connects directly to Firebase upon login without logging out Admin
        let createdUid = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const authRes = await tryCreateFirebaseAuthSeller(cleanEmail, password, {
          fullName: cleanFullName,
          username: derivedUsername,
          adminId: adminUid,
          adminName: adminName,
          createdAt: now
        });
        if (authRes.uid) {
          createdUid = authRes.uid;
        }

        const newProfile: UserProfile = stripUndefined({
          uid: createdUid,
          fullName: cleanFullName,
          username: derivedUsername,
          email: cleanEmail,
          role,
          adminId: role === 'admin' ? null : adminUid,
          adminName: role === 'admin' ? null : adminName,
          active: true,
          createdAt: now
        });

        let firestoreSynced = authRes.firestoreWritten;

        // Also persist profile & Google-claim invite to Firestore when Admin is signed in
        if (currentUser) {
          try {
            await setDoc(doc(db, 'users', createdUid), newProfile, { merge: true });
            firestoreSynced = true;
          } catch (err) {
            console.warn('No se pudo guardar perfil en Firestore:', err);
          }

          if (role === 'seller') {
            try {
              await setDoc(
                doc(db, 'seller_invites', emailToInviteId(cleanEmail)),
                stripUndefined({
                  fullName: cleanFullName,
                  username: derivedUsername,
                  email: cleanEmail,
                  role: 'seller',
                  adminId: adminUid,
                  adminName: adminName,
                  active: true,
                  createdAt: now
                }),
                { merge: true }
              );
              firestoreSynced = true;
            } catch (err) {
              console.warn('No se pudo guardar invitación de vendedor en Firestore:', err);
            }
          }
        }

        // Persist in shared directory with password hash & Firebase sync status
        upsertLocalDirectoryUser({
          ...newProfile,
          passwordHash,
          firebaseSynced: firestoreSynced,
          firebaseAuthCreated: authRes.authCreated
        });

        if (userProfile) {
          recordAuditLog(userProfile, 'USUARIO_CREADO', {
            changes: `Nuevo ${role === 'admin' ? 'administrador' : 'vendedor'} creado y conectado: ${cleanFullName} (@${derivedUsername})`
          });
        }

        const feedbackMessage = authRes.authCreated
          ? `¡Cuenta de ${cleanFullName} creada y conectada en vivo con Firebase Auth y Firestore! Al iniciar sesión desde cualquier dispositivo se conectará directo a la base de datos.`
          : firestoreSynced
          ? `¡Cuenta de ${cleanFullName} guardada en Firebase Firestore! Al entrar con Google usando ${cleanEmail} quedará conectada directo a la base de datos (y en este equipo también puede entrar con usuario/contraseña).`
          : `¡Cuenta de ${cleanFullName} creada! Para sincronizarla con la base de datos de Firebase en otros dispositivos, pulsa "Conectar con Firebase (Google)" arriba.`;

        setActionFeedback({
          type: 'success',
          text: feedbackMessage,
          credentials: {
            fullName: cleanFullName,
            username: derivedUsername,
            email: cleanEmail
          }
        });
      }

      setShowCreateModal(false);
      setEditingUser(null);
      setFullName('');
      setUsername('');
      setEmail('');
      setPassword('');
      setRole('seller');
      fetchUsers();
    } catch (err: any) {
      console.error('Error saving user:', err);
      setFormError(err?.message || 'Error al guardar el usuario.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Active / Suspended
  const executeToggleUserActive = async (user: UserProfile) => {
    setConfirmToggleUid(null);
    if (user.uid === userProfile?.uid) {
      setActionFeedback({ type: 'error', text: 'No puedes suspender tu propia cuenta administrativa.' });
      return;
    }

    const nextStatus = !user.active;
    const now = new Date().toISOString();
    try {
      upsertLocalDirectoryUser({
        ...user,
        active: nextStatus,
        updatedAt: now
      });

      if (currentUser) {
        await updateDoc(doc(db, 'users', user.uid), {
          active: nextStatus,
          updatedAt: now
        }).catch(() => {});

        if (user.role === 'seller') {
          await setDoc(
            doc(db, 'seller_invites', emailToInviteId(user.email)),
            stripUndefined({
              fullName: user.fullName,
              username: user.username,
              email: user.email.toLowerCase(),
              role: 'seller',
              adminId: user.adminId || adminUid,
              adminName: user.adminName || adminName,
              active: nextStatus,
              createdAt: user.createdAt,
              updatedAt: now
            })
          ).catch(() => {});
        }
      }

      if (userProfile) {
        recordAuditLog(userProfile, 'USUARIO_ESTADO', {
          changes: `Cuenta ${nextStatus ? 'reactivada' : 'suspendida'}: ${user.fullName}`
        });
      }
      setActionFeedback({
        type: 'success',
        text: `Cuenta de ${user.fullName} ${nextStatus ? 'reactivada' : 'suspendida'}.`
      });
      fetchUsers();
    } catch (err) {
      console.error('Error toggling status:', err);
      setActionFeedback({ type: 'error', text: 'No se pudo actualizar el estado de la cuenta.' });
    }
  };

  const openEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setFullName(user.fullName);
    setUsername(user.username || '');
    setEmail(user.email);
    setPassword('');
    setRole(sanitizeRole(user.role));
    setFormError(null);
    setShowCreateModal(true);
  };

  const copyCredentials = (creds: { fullName: string; username: string; email: string }) => {
    const text = `Acceso CLIENTES PRO\nVendedor: ${creds.fullName}\nUsuario: ${creds.username}\nCorreo: ${creds.email}\n(Usa la contraseña asignada por el Administrador)`;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedCreds(true);
    setTimeout(() => setCopiedCreds(false), 2000);
  };

  const filteredUsers = usersList.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.username && u.username.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 pb-20">
      {/* Top Banner */}
      <div className="bg-slate-850 border border-slate-700/80 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 bg-blue-950/60 border border-blue-800/80 px-2.5 py-0.5 rounded-md">
              Conexión Directa Administrador · Vendedores
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white mt-1.5 flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-400" />
              Gestión de Vendedores
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Crea usuarios de vendedores listos para trabajar, conéctalos directamente contigo y controla su acceso en tiempo real
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {!isFirebaseConnected ? (
              <button
                type="button"
                onClick={handleConnectAdminFirebase}
                disabled={connectingFirebase}
                className="px-3.5 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 font-bold text-xs transition flex items-center gap-2"
              >
                <Cloud className="w-4 h-4 text-amber-300" />
                {connectingFirebase ? 'Conectando...' : 'Conectar con Firebase (Google)'}
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const synced = await syncLocalSellersToFirestore(adminUid, adminName);
                  setActionFeedback({
                    type: 'success',
                    text:
                      synced > 0
                        ? `${synced} usuario(s) sincronizado(s) con Firebase Firestore.`
                        : 'Todos los usuarios ya están sincronizados con Firebase Firestore.'
                  });
                  fetchUsers();
                }}
                className="px-3 py-2.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-700/70 text-emerald-300 font-bold text-xs transition flex items-center gap-1.5"
                title="Sincronizar vendedores con la base de datos de Firebase"
              >
                <Cloud className="w-4 h-4 text-emerald-400" />
                Firebase Conectado
              </button>
            )}

            <button
              onClick={() => {
                setEditingUser(null);
                setFullName('');
                setUsername('');
                setEmail('');
                setPassword('');
                setRole('seller');
                setFormError(null);
                setShowCreateModal(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Crear Nuevo Vendedor
            </button>
          </div>
        </div>

        {/* Live Connection Summary */}
        <div className="mt-4 pt-4 border-t border-slate-700/60 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              Vendedores Conectados Ahora
            </span>
            <span className="text-base font-black text-emerald-400 font-mono tabular-nums">
              {totalConnectedSellers}
            </span>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              Vendedores Registrados
            </span>
            <span className="text-base font-black text-white font-mono tabular-nums">
              {totalSellersCount}
            </span>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-indigo-400" />
              Administrador Vinculado
            </span>
            <span className="text-xs font-bold text-indigo-300 truncate max-w-[140px]">
              {adminName}
            </span>
          </div>
        </div>

        {/* Live Online Sellers Chips */}
        {connectedSellers.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
              En línea:
            </span>
            {connectedSellers.map((s) => (
              <span
                key={s.uid}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/50 border border-emerald-800/70 text-emerald-200 font-semibold text-[11px]"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {s.fullName}
              </span>
            ))}
          </div>
        )}

        {/* Feedback Banner */}
        {actionFeedback && (
          <div
            className={`mt-4 p-3.5 rounded-xl text-xs border space-y-2 ${
              actionFeedback.type === 'error'
                ? 'bg-red-950/70 border-red-800 text-red-200'
                : 'bg-emerald-950/70 border-emerald-800 text-emerald-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{actionFeedback.text}</span>
              <button
                type="button"
                onClick={() => setActionFeedback(null)}
                className="text-xs opacity-75 hover:opacity-100 px-2"
              >
                ✕
              </button>
            </div>
            {actionFeedback.credentials && (
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/60 border border-emerald-800/50 rounded-lg px-3 py-2 text-[11px]">
                <div className="space-x-3 font-mono text-emerald-100">
                  <span>Usuario: <strong>{actionFeedback.credentials.username}</strong></span>
                  <span>Correo: <strong>{actionFeedback.credentials.email}</strong></span>
                </div>
                <button
                  type="button"
                  onClick={() => copyCredentials(actionFeedback.credentials!)}
                  className="px-2.5 py-1 rounded-md bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-100 font-bold flex items-center gap-1 transition"
                >
                  {copiedCreds ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCreds ? 'Copiado' : 'Copiar Acceso'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <div className="mt-4 pt-4 border-t border-slate-700/60 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 mt-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar vendedor por nombre, usuario o correo electrónico..."
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-850 border border-slate-700/80 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase font-semibold">
              <tr>
                <th className="p-3.5">Nombre / Credenciales</th>
                <th className="p-3.5">Rol</th>
                <th className="p-3.5">Conexión con Administrador</th>
                <th className="p-3.5 text-center">Clientes Registrados</th>
                <th className="p-3.5">Estado Cuenta</th>
                <th className="p-3.5">Fecha Registro</th>
                <th className="p-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {loading && filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Cargando vendedores...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                    No se encontraron vendedores registrados.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const clientCount = clientCountMap.get(u.uid) || 0;
                  const presenceRec = presenceByUid[u.uid];
                  const isUserOnline = presenceRec ? isPresenceActive(presenceRec, nowMs) : false;

                  return (
                    <tr key={u.uid} className="hover:bg-slate-800/40 transition">
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="relative h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white text-xs shrink-0">
                            {u.fullName.slice(0, 2).toUpperCase()}
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-900 ${
                                isUserOnline ? 'bg-emerald-400' : 'bg-slate-600'
                              }`}
                              title={isUserOnline ? 'Conectado ahora' : 'Desconectado'}
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-white text-sm">{u.fullName}</p>
                              {isUserOnline && (
                                <span className="text-[10px] font-bold text-emerald-400">
                                  En línea
                                </span>
                              )}
                              {!isLocalPlaceholderUid(u.uid) ? (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-300 bg-sky-950/60 border border-sky-800/70 px-1.5 py-0.5 rounded"
                                  title="Conectado a la base de datos de Firebase"
                                >
                                  <Cloud className="w-2.5 h-2.5" />
                                  Firebase
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-800/80 border border-slate-700 px-1.5 py-0.5 rounded"
                                  title="Sincronizar con Firebase al conectar Google"
                                >
                                  <CloudOff className="w-2.5 h-2.5" />
                                  Local
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400">{u.email}</p>
                            {u.username && <p className="text-[10px] text-slate-500 font-mono">@{u.username}</p>}
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md font-bold text-[11px] ${
                            u.role === 'admin'
                              ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-800'
                              : 'bg-blue-950/80 text-blue-300 border border-blue-800'
                          }`}
                        >
                          {u.role === 'admin' ? 'ADMINISTRADOR' : 'VENDEDOR'}
                        </span>
                      </td>

                      <td className="p-3.5 text-slate-300">
                        {u.role === 'admin' ? (
                          <span className="text-indigo-300 font-semibold">Cuenta Principal</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-emerald-300 font-medium">
                            <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                            {u.adminName || adminName}
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-center font-mono font-bold text-white text-sm">
                        {clientCount}
                      </td>

                      <td className="p-3.5">
                        {u.active ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-400">
                            <XCircle className="w-3.5 h-3.5" /> Suspendido
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-slate-400">
                        {formatDominicanDateTime(u.createdAt)}
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(u)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="Editar vendedor"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {confirmToggleUid === u.uid ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => executeToggleUserActive(u)}
                                className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold transition"
                              >
                                Confirmar
                              </button>
                              <button
                                onClick={() => setConfirmToggleUid(null)}
                                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                if (u.uid === userProfile?.uid) {
                                  setActionFeedback({
                                    type: 'error',
                                    text: 'No puedes suspender tu propia cuenta administrativa.'
                                  });
                                } else {
                                  setConfirmToggleUid(u.uid);
                                }
                              }}
                              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                                u.active
                                  ? 'bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-800/80'
                                  : 'bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/80'
                              }`}
                            >
                              {u.active ? 'Suspender' : 'Activar'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Seller Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white text-base">
                {editingUser ? 'Editar Cuenta de Vendedor' : 'Crear Nuevo Vendedor'}
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitUser} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-red-950/70 border border-red-800 text-red-300 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block font-bold uppercase text-slate-300 mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej: Carlos Ramírez"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white text-sm"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Este nombre aparecerá en pantalla cuando el vendedor inicie sesión y en todos sus clientes.
                </p>
              </div>

              <div>
                <label className="block font-bold uppercase text-slate-300 mb-1">Usuario de Acceso (Login)</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ej: cramirez"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white text-sm font-mono"
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-slate-300 mb-1">Correo Electrónico *</label>
                <input
                  type="email"
                  value={email}
                  disabled={Boolean(editingUser)}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="carlos@clientespro.do"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white text-sm disabled:opacity-50"
                  required
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-slate-300 mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-blue-400" />
                  {editingUser ? 'Nueva Contraseña (Opcional)' : 'Contraseña de Acceso *'}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingUser ? 'Dejar vacío para mantener la actual' : 'Mínimo 6 caracteres'}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white text-sm"
                  required={!editingUser}
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-slate-300 mb-1">Rol en el Sistema</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white text-sm"
                >
                  <option value="seller">VENDEDOR (Conectado con el Administrador)</option>
                  <option value="admin">ADMINISTRADOR (Control total)</option>
                </select>
              </div>

              {role === 'seller' && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Este vendedor quedará conectado directamente con <strong>{adminName}</strong> (Administrador).
                  </span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold"
                >
                  {isSubmitting ? 'Guardando...' : editingUser ? 'Actualizar Vendedor' : 'Crear Vendedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
