import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { usePresence } from '../context/PresenceContext';
import { UserRole } from '../types';
import {
  Users,
  UserPlus,
  BarChart3,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  Shield,
  History,
  Compass,
  Download,
  Radio,
  Link2,
  Cloud
} from 'lucide-react';

interface NavbarProps {
  currentView: 'register' | 'clients' | 'map' | 'dashboard' | 'sellers' | 'audit';
  onNavigate: (view: 'register' | 'clients' | 'map' | 'dashboard' | 'sellers' | 'audit') => void;
  onOpenSyncModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate, onOpenSyncModal }) => {
  const { userProfile, logout, activeRole, isFirebaseConnected, loginWithGoogle } = useAuth();
  const { isOnline, pendingCount, isSyncing } = useSync();
  const { totalConnectedSellers, isAdminOnline, connectedAdmins } = usePresence();

  const getRoleLabel = (role: UserRole) => {
    return role === 'admin' ? 'Administrador' : 'Vendedor';
  };

  const linkedAdminName =
    connectedAdmins[0]?.fullName || userProfile?.adminName || 'Administrador';

  return (
    <>
      {/* Top Main Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800/80 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand Wordmark & Emblem */}
            <div
              className="flex items-center space-x-3.5 cursor-pointer select-none group"
              onClick={() => onNavigate(activeRole === 'seller' ? 'register' : 'dashboard')}
            >
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white font-black text-lg tracking-tight group-hover:scale-105 transition-transform duration-200">
                CP
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-base tracking-tight text-white">
                    CLIENTES <span className="text-blue-400">PRO</span>
                  </span>
                  <span className="hidden sm:inline-block text-[10px] font-semibold text-slate-400 tracking-wider">
                    · RD
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-medium hidden sm:block">
                  Gestión Comercial & Terreno
                </p>
              </div>
            </div>

            {/* Desktop Navigation Tabs */}
            <nav className="hidden md:flex items-center space-x-1 lg:space-x-1.5">
              <button
                onClick={() => onNavigate('register')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 flex items-center gap-2 ${
                  currentView === 'register'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900/90'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                Registrar Cliente
              </button>

              <button
                onClick={() => onNavigate('clients')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 flex items-center gap-2 ${
                  currentView === 'clients'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900/90'
                }`}
              >
                <Users className="w-4 h-4" />
                Expedientes
              </button>

              <button
                onClick={() => onNavigate('map')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 flex items-center gap-2 ${
                  currentView === 'map'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900/90'
                }`}
              >
                <Compass className="w-4 h-4 text-emerald-400" />
                Mapa Radar
              </button>

              {activeRole === 'admin' && (
                <button
                  onClick={() => onNavigate('dashboard')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 flex items-center gap-2 ${
                    currentView === 'dashboard'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/90'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                  Métricas
                </button>
              )}

              {activeRole === 'admin' && (
                <button
                  onClick={() => onNavigate('sellers')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 flex items-center gap-2 ${
                    currentView === 'sellers'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/90'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  Vendedores
                </button>
              )}

              {activeRole === 'admin' && (
                <button
                  onClick={() => onNavigate('audit')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 flex items-center gap-2 ${
                    currentView === 'audit'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/90'
                  }`}
                >
                  <History className="w-4 h-4" />
                  Auditoría
                </button>
              )}
            </nav>

            {/* Right Zone: Connection Status, Sync Queue & Profile */}
            <div className="flex items-center space-x-2 sm:space-x-2.5">
              {/* Admin Live Connected Sellers Indicator */}
              {activeRole === 'admin' ? (
                <button
                  onClick={() => onNavigate('dashboard')}
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/40 transition-colors"
                  title={`${totalConnectedSellers} vendedor${totalConnectedSellers === 1 ? '' : 'es'} conectado${totalConnectedSellers === 1 ? '' : 's'} ahora`}
                >
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden lg:inline text-[11px]">Vendedores:</span>
                  <span className="font-mono font-bold tabular-nums text-[11px]">
                    {totalConnectedSellers}
                  </span>
                </button>
              ) : (
                <div
                  className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    isAdminOnline
                      ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                      : 'bg-blue-950/40 border-blue-800/60 text-blue-300'
                  }`}
                  title={`Conectado con Administrador: ${linkedAdminName}`}
                >
                  <Link2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px]">
                    {isAdminOnline ? 'Admin En Línea' : 'Conectado con Admin'}
                  </span>
                </div>
              )}

              {/* Firebase Database Connection Indicator / Connect Action */}
              {isFirebaseConnected ? (
                <div
                  className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-950/50 border border-sky-800/70 text-sky-300"
                  title="Sesión conectada en tiempo real a la base de datos de Firebase Firestore"
                >
                  <Cloud className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-[11px]">Firebase</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    loginWithGoogle().catch(() => {});
                  }}
                  className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-950/50 hover:bg-amber-900/60 border border-amber-700/70 text-amber-200 transition-colors"
                  title="Conecta tu cuenta con Google para sincronizar usuarios y clientes con la base de datos de Firebase"
                >
                  <Cloud className="w-3.5 h-3.5 text-amber-300" />
                  <span className="text-[11px]">Conectar Firebase</span>
                </button>
              )}

              {/* Online / Offline status badge */}
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  isOnline
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                    : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                }`}
                title={isOnline ? 'Conexión activa con el servidor' : 'Modo Offline - Guardando en IndexedDB local'}
              >
                {isOnline ? (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="hidden xl:inline text-[11px]">En Línea</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[11px]">Offline</span>
                  </>
                )}
              </div>

              {/* Pending Sync Queue Button */}
              <button
                onClick={onOpenSyncModal}
                className={`relative px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                  pendingCount > 0
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
                title="Cola de registros pendientes de sincronización"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
                <span className="hidden xl:inline text-[11px]">Cola:</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full font-bold tabular-nums text-[10px] ${
                    pendingCount > 0 ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {pendingCount}
                </span>
              </button>

              {/* User Name, Avatar & Logout */}
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-800">
                <div className="text-right">
                  <p className="text-xs font-bold text-white truncate max-w-[125px] sm:max-w-[165px]">
                    {userProfile?.fullName || 'Usuario'}
                  </p>
                  <p className="text-[10px] text-blue-300/90 font-semibold">
                    {getRoleLabel(activeRole)}
                  </p>
                </div>

                <div className="h-8 w-8 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-xs font-bold text-blue-200 shrink-0">
                  {(userProfile?.fullName || 'U').charAt(0).toUpperCase()}
                </div>

                {activeRole === 'admin' && (
                  <a
                    href="/clientes-pro-codigo-fuente.zip"
                    download="clientes-pro-codigo-fuente.zip"
                    className="hidden sm:flex p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-900 rounded-lg transition-colors items-center gap-1"
                    title="Descargar Código Fuente Completo (.ZIP)"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                )}

                <button
                  onClick={logout}
                  className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-900 rounded-lg transition-colors"
                  title="Cerrar Sesión"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Dock */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/90 px-3 py-2 flex justify-around items-center shadow-2xl safe-area-inset-bottom">
        <button
          onClick={() => onNavigate('register')}
          className={`relative flex flex-col items-center py-1 px-3 rounded-xl transition-all duration-150 ${
            currentView === 'register' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <UserPlus className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight">Registrar</span>
          {currentView === 'register' && (
            <span className="absolute bottom-0 w-6 h-0.5 bg-blue-400 rounded-full" />
          )}
        </button>

        <button
          onClick={() => onNavigate('clients')}
          className={`relative flex flex-col items-center py-1 px-3 rounded-xl transition-all duration-150 ${
            currentView === 'clients' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight">Expedientes</span>
          {currentView === 'clients' && (
            <span className="absolute bottom-0 w-6 h-0.5 bg-blue-400 rounded-full" />
          )}
        </button>

        <button
          onClick={() => onNavigate('map')}
          className={`relative flex flex-col items-center py-1 px-3 rounded-xl transition-all duration-150 ${
            currentView === 'map' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass className="w-5 h-5 mb-0.5 text-emerald-400" />
          <span className="text-[10px] tracking-tight">Mapa</span>
          {currentView === 'map' && (
            <span className="absolute bottom-0 w-6 h-0.5 bg-emerald-400 rounded-full" />
          )}
        </button>

        {activeRole === 'admin' && (
          <button
            onClick={() => onNavigate('dashboard')}
            className={`relative flex flex-col items-center py-1 px-3 rounded-xl transition-all duration-150 ${
              currentView === 'dashboard' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Métricas</span>
            {currentView === 'dashboard' && (
              <span className="absolute bottom-0 w-6 h-0.5 bg-blue-400 rounded-full" />
            )}
          </button>
        )}

        {activeRole === 'admin' && (
          <button
            onClick={() => onNavigate('sellers')}
            className={`relative flex flex-col items-center py-1 px-3 rounded-xl transition-all duration-150 ${
              currentView === 'sellers' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">Vendedores</span>
            {currentView === 'sellers' && (
              <span className="absolute bottom-0 w-6 h-0.5 bg-blue-400 rounded-full" />
            )}
          </button>
        )}
      </nav>
    </>
  );
};
