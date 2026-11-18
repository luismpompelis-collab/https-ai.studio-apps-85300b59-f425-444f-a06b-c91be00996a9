import React from 'react';
import { useSync } from '../context/SyncContext';
import { formatDominicanDateTime, formatDominicanPhone } from '../lib/dominicanValidation';
import {
  RefreshCw,
  X,
  Wifi,
  WifiOff,
  Clock,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  FileText,
  MapPin,
  Camera
} from 'lucide-react';

interface OfflineSyncModalProps {
  onClose: () => void;
}

export const OfflineSyncModal: React.FC<OfflineSyncModalProps> = ({ onClose }) => {
  const { isOnline, pendingItems, pendingCount, isSyncing, syncProgress, syncNow } = useSync();

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-600/20 text-amber-400">
              <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Cola de Sincronización Fuera de Línea</h2>
              <p className="text-xs text-slate-400">
                Almacenamiento permanente en IndexedDB hasta confirmación en el servidor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status bar */}
        <div className="px-6 py-3 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <Wifi className="w-4 h-4" /> Conexión Activa
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-400 font-bold">
                <WifiOff className="w-4 h-4" /> Sin Conexión (Modo Offline)
              </span>
            )}
          </div>

          <span className="text-slate-300 font-medium">
            {pendingCount} registro{pendingCount === 1 ? '' : 's'} pendiente{pendingCount === 1 ? '' : 's'}
          </span>
        </div>

        {/* Body list of pending queue items */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1 text-xs">
          {pendingItems.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <p className="text-sm font-bold text-white">¡Todos los datos están sincronizados!</p>
              <p className="text-xs max-w-sm mx-auto">
                No hay expedientes pendientes de envío en la memoria local de tu dispositivo.
              </p>
            </div>
          ) : (
            pendingItems.map((item) => (
              <div
                key={item.id}
                className="bg-slate-800/70 border border-slate-700/80 rounded-xl p-3.5 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-white text-sm">{item.clientData.fullName}</h3>
                    <p className="font-mono text-slate-400 text-[11px]">
                      Cédula: {item.clientData.cedula} | Tel: {formatDominicanPhone(item.clientData.phone)}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-950/80 text-amber-300 border border-amber-800">
                    {item.action === 'create' ? 'Nuevo' : item.action === 'update' ? 'Edición' : 'Eliminación'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-750 pt-2">
                  <div className="flex items-center gap-2">
                    {item.clientData.latitude !== null && (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> GPS ({item.clientData.latitude.toFixed(4)})
                      </span>
                    )}
                    {item.clientData.cedulaFront && (
                      <span className="text-indigo-400 flex items-center gap-1">
                        <Camera className="w-3 h-3" /> Con Foto
                      </span>
                    )}
                  </div>
                  <span>Reintentos: {item.retryCount}</span>
                </div>

                {item.lastError && (
                  <p className="text-[10px] text-red-300 bg-red-950/50 p-1.5 rounded border border-red-900/60">
                    Último intento: {item.lastError}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-slate-850 border-t border-slate-800 flex items-center justify-between gap-3">
          {syncProgress && (
            <div className="text-xs text-blue-400 font-bold flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Sincronizando {syncProgress.current} de {syncProgress.total}...
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Cerrar
            </button>

            <button
              onClick={syncNow}
              disabled={isSyncing || pendingCount === 0 || !isOnline}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-md"
            >
              <UploadCloud className="w-4 h-4" />
              {isSyncing ? 'Sincronizando...' : 'Sincronizar Ahora'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
