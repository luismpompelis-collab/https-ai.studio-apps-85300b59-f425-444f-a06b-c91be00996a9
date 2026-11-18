import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { usePresence } from '../context/PresenceContext';
import { isPresenceActive } from '../lib/presence';
import { UserProfile, UserRole } from '../types';
import { collection, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db, stripUndefined } from '../lib/firebase';
import { recordAuditLog } from '../lib/audit';
import {
  Shield,
  UserPlus,
  CheckCircle2,
  XCircle,
  Edit2,
  Search,
  AlertCircle,
  Radio,
  Users
} from 'lucide-react';
import { formatDominicanDateTime } from '../lib/dominicanValidation';

const LOCAL_USERS_KEY = 'clientes_pro_local_users';

export const SellerManagement: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const { allClients } = useSync();
  const {
    connectedSupervisors,
    connectedSellers,
    totalConnectedTeam,
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
  const [supervisorId, setSupervisorId] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFeedback, setActionFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [confirmToggleUid, setConfirmToggleUid] = useState<string | null>(null);

  const loadLocalUsers = (): UserProfile[] => {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]') as UserProfile[];
      if (userProfile && !saved.some((u) => u.uid === userProfile.uid)) {
        return [userProfile, ...saved];
      }
      return saved.length > 0 ? saved : userProfile ? [userProfile] : [];
    } catch {
      return userProfile ? [userProfile] : [];
    }
  };

  // Fetch users from Firestore (when authenticated) or local cache
  const fetchUsers = async () => {
    setLoading(true);
    try {
      if (!currentUser) {
        const local = loadLocalUsers();
        setUsersList(local);
        return;
      }

      const snap = await getDocs(collection(db, 'users'));
      const list: UserProfile[] = [];
      snap.forEach((d) => list.push(d.data() as UserProfile));

      if (list.length === 0 && userProfile) {
        list.push(userProfile);
      }
      setUsersList(list);
    } catch (err) {
      console.warn('Error fetching users, using local view:', err);
      setUsersList(loadLocalUsers());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [currentUser, userProfile]);

  // Supervisors available for assignment
  const supervisors = usersList.filter((u) => u.role === 'supervisor' || u.role === 'admin');

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

  // Create or Update User
  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!fullName.trim() || !email.trim()) {
      setFormError('El nombre completo y el correo electrónico son requeridos.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingUser) {
        const updatedFields = stripUndefined({
          fullName: fullName.trim(),
          username: username.trim().toLowerCase(),
          role,
          supervisorId: supervisorId || null,
          updatedAt: new Date().toISOString()
        });

        if (currentUser) {
          const userRef = doc(db, 'users', editingUser.uid);
          await updateDoc(userRef, updatedFields);
        } else {
          const updatedList = usersList.map((u) =>
            u.uid === editingUser.uid ? { ...u, ...updatedFields } : u
          );
          localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(updatedList));
        }

        if (userProfile) {
          recordAuditLog(userProfile, 'USUARIO_ESTADO', {
            changes: `Actualización de usuario: ${fullName} (${role})`
          });
        }
      } else {
        if (!password || password.length < 6) {
          setFormError('La contraseña inicial debe tener al menos 6 caracteres.');
          setIsSubmitting(false);
          return;
        }

        const newUid = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const newProfile: UserProfile = stripUndefined({
          uid: newUid,
          fullName: fullName.trim(),
          username: username.trim().toLowerCase() || email.split('@')[0],
          email: email.trim().toLowerCase(),
          role,
          supervisorId: supervisorId || null,
          active: true,
          createdAt: new Date().toISOString()
        });

        if (currentUser) {
          await setDoc(doc(db, 'users', newUid), newProfile);
        } else {
          const updatedList = [newProfile, ...loadLocalUsers()];
          localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(updatedList));
        }

        if (userProfile) {
          recordAuditLog(userProfile, 'USUARIO_CREADO', {
            changes: `Nuevo ${role} registrado: ${fullName} (${email})`
          });
        }
      }

      setShowCreateModal(false);
      setEditingUser(null);
      setFullName('');
      setUsername('');
      setEmail('');
      setPassword('');
      setRole('seller');
      setSupervisorId('');
      setActionFeedback({ type: 'success', text: 'Usuario guardado correctamente.' });
      fetchUsers();
    } catch (err: any) {
      console.error('Error saving user:', err);
      setFormError(err.message || 'Error al guardar el usuario en el servidor.');
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
    try {
      if (currentUser) {
        await updateDoc(doc(db, 'users', user.uid), {
          active: nextStatus,
          updatedAt: new Date().toISOString()
        });
      } else {
        const updatedList = usersList.map((u) =>
          u.uid === user.uid ? { ...u, active: nextStatus, updatedAt: new Date().toISOString() } : u
        );
        localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(updatedList));
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
    setRole(user.role);
    setSupervisorId(user.supervisorId || '');
    setShowCreateModal(true);
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
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-400 bg-purple-950/60 border border-purple-800/80 px-2.5 py-0.5 rounded-full">
              Control de Accesos y Roles
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white mt-1.5 flex items-center gap-2">
              <Shield className="w-6 h-6 text-purple-400" />
              Gestión de Vendedores y Supervisores
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Administra credenciales, activa o suspende cuentas y asigna supervisores de equipo
            </p>
          </div>

          <button
            onClick={() => {
              setEditingUser(null);
              setFullName('');
              setUsername('');
              setEmail('');
              setPassword('');
              setRole('seller');
              setSupervisorId('');
              setShowCreateModal(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition flex items-center gap-2 self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            Crear Nuevo Vendedor / Supervisor
          </button>
        </div>

        {/* Live Connection Summary */}
        <div className="mt-4 pt-4 border-t border-slate-700/60 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              Total Conectados (Sup. + Vend.)
            </span>
            <span className="text-base font-black text-emerald-400 font-mono tabular-nums">
              {totalConnectedTeam}
            </span>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              Supervisores En Línea
            </span>
            <span className="text-base font-black text-white font-mono tabular-nums">
              {connectedSupervisors.length}
            </span>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              Vendedores En Línea
            </span>
            <span className="text-base font-black text-white font-mono tabular-nums">
              {connectedSellers.length}
            </span>
          </div>
        </div>

        {/* Feedback Banner */}
        {actionFeedback && (
          <div
            className={`mt-4 p-3 rounded-xl text-xs flex items-center justify-between border ${
              actionFeedback.type === 'error'
                ? 'bg-red-950/70 border-red-800 text-red-200'
                : 'bg-emerald-950/70 border-emerald-800 text-emerald-200'
            }`}
          >
            <span>{actionFeedback.text}</span>
            <button
              type="button"
              onClick={() => setActionFeedback(null)}
              className="text-xs opacity-75 hover:opacity-100 px-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Search */}
        <div className="mt-4 pt-4 border-t border-slate-700/60 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 mt-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, usuario o correo electrónico..."
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-850 border border-slate-700/80 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase font-semibold">
              <tr>
                <th className="p-3.5">Usuario / Nombre</th>
                <th className="p-3.5">Rol Comercial</th>
                <th className="p-3.5">Supervisor Asignado</th>
                <th className="p-3.5 text-center">Clientes Registrados</th>
                <th className="p-3.5">Estado Cuenta</th>
                <th className="p-3.5">Fecha Registro</th>
                <th className="p-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                    No se encontraron usuarios.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const clientCount = clientCountMap.get(u.uid) || 0;
                  const supervisorObj = usersList.find((sup) => sup.uid === u.supervisorId);
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
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-white text-sm">{u.fullName}</p>
                              {isUserOnline && (
                                <span className="text-[10px] font-bold text-emerald-400">
                                  En línea
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
                              : u.role === 'supervisor'
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                              : 'bg-blue-950/80 text-blue-300 border border-blue-800'
                          }`}
                        >
                          {u.role.toUpperCase()}
                        </span>
                      </td>

                      <td className="p-3.5 text-slate-300">
                        {supervisorObj ? (
                          <span className="font-medium">{supervisorObj.fullName}</span>
                        ) : (
                          <span className="text-slate-500 italic">Sin supervisor</span>
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
                            title="Editar usuario"
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

      {/* Create / Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white text-base">
                {editingUser ? 'Editar Usuario / Vendedor' : 'Crear Nuevo Vendedor'}
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
              </div>

              <div>
                <label className="block font-bold uppercase text-slate-300 mb-1">Nombre de Usuario (Login)</label>
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

              {!editingUser && (
                <div>
                  <label className="block font-bold uppercase text-slate-300 mb-1">Contraseña Inicial *</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white text-sm"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block font-bold uppercase text-slate-300 mb-1">Rol en el Sistema</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white text-sm"
                >
                  <option value="seller">VENDEDOR (Registra clientes y GPS)</option>
                  <option value="supervisor">SUPERVISOR (Gestiona equipo y descarga reportes)</option>
                  <option value="admin">ADMINISTRADOR (Acceso total)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold uppercase text-slate-300 mb-1">Supervisor Asignado</label>
                <select
                  value={supervisorId}
                  onChange={(e) => setSupervisorId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white text-sm"
                >
                  <option value="">Sin supervisor directo</option>
                  {supervisors.map((sup) => (
                    <option key={sup.uid} value={sup.uid}>
                      {sup.fullName} ({sup.role})
                    </option>
                  ))}
                </select>
              </div>

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
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold"
                >
                  {isSubmitting ? 'Guardando...' : editingUser ? 'Actualizar' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
