import React, { useEffect, useState } from 'react';
import { AuditLog, ClientData } from '../types';
import { fetchRecentAuditLogs } from '../lib/audit';
import { useSync } from '../context/SyncContext';
import { formatDominicanDateTime } from '../lib/dominicanValidation';
import {
  History,
  Trash2,
  RotateCcw,
  User,
  Shield,
  Clock,
  Layers,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

export const AuditLogView: React.FC = () => {
  const { allClients, enqueueClient } = useSync();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'audit' | 'recycleBin'>('audit');
  const [search, setSearch] = useState('');
  const [restoreFeedback, setRestoreFeedback] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    const result = await fetchRecentAuditLogs(100);
    setLogs(result);
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Soft deleted clients for recycle bin
  const deletedClients = allClients.filter((c) => Boolean(c.deletedAt));

  // Restore client from recycle bin
  const handleRestore = async (client: ClientData) => {
    const restored: ClientData = {
      ...client,
      deletedAt: null,
      deletedBy: null,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending'
    };
    await enqueueClient(restored, 'update');
    setRestoreFeedback(`Expediente de "${client.fullName}" restaurado correctamente.`);
    await loadLogs();
  };

  const filteredLogs = logs.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.userName.toLowerCase().includes(q) ||
      (l.clientName && l.clientName.toLowerCase().includes(q)) ||
      l.action.toLowerCase().includes(q) ||
      (l.changes && l.changes.toLowerCase().includes(q))
    );
  });

  const getActionBadge = (action: AuditLog['action']) => {
    switch (action) {
      case 'CREAR':
        return 'bg-emerald-950/80 text-emerald-400 border border-emerald-800';
      case 'MODIFICAR':
        return 'bg-blue-950/80 text-blue-400 border border-blue-800';
      case 'ELIMINAR':
        return 'bg-rose-950/80 text-rose-400 border border-rose-800';
      case 'RESTAURAR':
        return 'bg-purple-950/80 text-purple-400 border border-purple-800';
      case 'SINCRONIZAR':
        return 'bg-amber-950/80 text-amber-400 border border-amber-800';
      default:
        return 'bg-slate-800 text-slate-300 border border-slate-700';
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Banner */}
      <div className="bg-slate-850 border border-slate-700/80 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 bg-blue-950/60 border border-blue-800/80 px-2.5 py-0.5 rounded-full">
              Trazabilidad y Seguridad
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white mt-1.5 flex items-center gap-2">
              <History className="w-6 h-6 text-blue-400" />
              Historial de Actividades y Auditoría
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Registro inmutable de creación, cambios, eliminaciones y papelera de recuperación
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="inline-flex p-1 bg-slate-900 rounded-xl border border-slate-700 text-xs font-semibold self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === 'audit' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Bitácora ({logs.length})
            </button>
            <button
              onClick={() => setActiveTab('recycleBin')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === 'recycleBin' ? 'bg-red-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Papelera ({deletedClients.length})
            </button>
          </div>
        </div>

        {activeTab === 'audit' && (
          <div className="mt-4 pt-4 border-t border-slate-700/60 flex items-center justify-between gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar bitácora por usuario, cliente o tipo de acción..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
              />
            </div>
            <button
              onClick={loadLogs}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Actualizar bitácora"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}
      </div>

      {/* Tab 1: Audit Log Table */}
      {activeTab === 'audit' && (
        <div className="bg-slate-850 border border-slate-700/80 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="p-3.5">Fecha y Hora</th>
                  <th className="p-3.5">Usuario / Rol</th>
                  <th className="p-3.5">Acción</th>
                  <th className="p-3.5">Cliente Afectado</th>
                  <th className="p-3.5">Detalles del Cambio</th>
                  <th className="p-3.5">Dispositivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                      No hay registros en la bitácora aún.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.logId} className="hover:bg-slate-800/40 transition">
                      <td className="p-3.5 font-mono text-slate-300 whitespace-nowrap">
                        {formatDominicanDateTime(log.timestamp)}
                      </td>
                      <td className="p-3.5">
                        <p className="font-bold text-white">{log.userName}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{log.userRole}</p>
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getActionBadge(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-200 font-semibold">
                        {log.clientName || log.clientId || '-'}
                      </td>
                      <td className="p-3.5 text-slate-300 max-w-xs truncate">
                        {log.changes || '-'}
                      </td>
                      <td className="p-3.5 text-slate-500 text-[10px] max-w-[120px] truncate">
                        {log.device || 'Navegador Web'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Recycle Bin (Papelera con Restauración) */}
      {activeTab === 'recycleBin' && (
        <div className="bg-slate-850 border border-slate-700/80 rounded-2xl shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-400" />
            <div>
              <h2 className="font-bold text-white text-sm">Papelera de Eliminación Lógica</h2>
              <p className="text-xs text-slate-400">
                Los clientes eliminados se conservan protegidos para evitar pérdidas involuntarias de datos
              </p>
            </div>
          </div>

          {restoreFeedback && (
            <div className="p-3 bg-emerald-950/70 border border-emerald-800 text-emerald-200 rounded-xl text-xs flex items-center justify-between">
              <span>{restoreFeedback}</span>
              <button onClick={() => setRestoreFeedback(null)} className="px-2">✕</button>
            </div>
          )}

          {deletedClients.length === 0 ? (
            <div className="py-12 text-center text-slate-400 italic">
              La papelera está vacía. No hay clientes eliminados.
            </div>
          ) : (
            <div className="space-y-3">
              {deletedClients.map((client) => (
                <div
                  key={client.clientId}
                  className="bg-slate-900/90 border border-red-900/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <h3 className="font-extrabold text-white text-sm">{client.fullName}</h3>
                    <p className="text-xs font-mono text-slate-400">
                      Cédula: {client.cedula} | Sector: {client.sector}
                    </p>
                    <p className="text-[11px] text-red-400 mt-1">
                      Eliminado por: {client.deletedBy || 'Administrador'} el {formatDominicanDateTime(client.deletedAt)}
                    </p>
                  </div>

                  <button
                    onClick={() => handleRestore(client)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restaurar Expediente
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
