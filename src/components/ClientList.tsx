import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { ClientData, ClientFilter } from '../types';
import {
  formatDominicanDateTime,
  formatDominicanPhone,
  DOMINICAN_SECTORS
} from '../lib/dominicanValidation';
import { exportClientsToExcel } from '../lib/excelExport';
import {
  Search,
  Filter,
  FileSpreadsheet,
  MapPin,
  Camera,
  CheckCircle2,
  Clock,
  RotateCcw,
  Eye,
  Trash2,
  User,
  Phone,
  Calendar,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

interface ClientListProps {
  onSelectClient: (client: ClientData) => void;
  onEditClient: (client: ClientData) => void;
}

export const ClientList: React.FC<ClientListProps> = ({ onSelectClient, onEditClient }) => {
  const { activeRole, userProfile } = useAuth();
  const { allClients, loadingClients, refreshClients, enqueueClient } = useSync();

  // Search & Filter state
  const [filters, setFilters] = useState<ClientFilter>({
    searchQuery: '',
    sellerId: '',
    supervisorId: '',
    sector: '',
    startDate: '',
    endDate: '',
    syncStatus: 'all',
    hasPhoto: 'all',
    showDeleted: false
  });

  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Distinct sellers and supervisors for filter dropdowns
  const distinctSellers = useMemo(() => {
    const map = new Map<string, string>();
    allClients.forEach((c) => {
      if (c.sellerId && c.sellerName) {
        map.set(c.sellerId, c.sellerName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allClients]);

  // Distinct sectors
  const distinctSectors = useMemo(() => {
    const set = new Set<string>();
    allClients.forEach((c) => {
      if (c.sector) set.add(c.sector);
    });
    return Array.from(set).sort();
  }, [allClients]);

  // Filtered clients list
  const filteredClients = useMemo(() => {
    return allClients.filter((client) => {
      // Role scope check
      if (activeRole === 'seller' && client.sellerId !== userProfile?.uid) {
        return false;
      }
      if (activeRole === 'supervisor' && client.supervisorId && client.supervisorId !== userProfile?.uid) {
        // Can view own team
      }

      // Deleted state
      if (!filters.showDeleted && client.deletedAt) return false;
      if (filters.showDeleted && !client.deletedAt) return false;

      // Text query
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        const matchName = client.fullName.toLowerCase().includes(q);
        const matchCedula = client.cedula.replace(/\D/g, '').includes(q.replace(/\D/g, ''));
        const matchPhone = client.phone.replace(/\D/g, '').includes(q.replace(/\D/g, ''));
        const matchSector = client.sector.toLowerCase().includes(q);
        if (!matchName && !matchCedula && !matchPhone && !matchSector) return false;
      }

      // Seller filter
      if (filters.sellerId && client.sellerId !== filters.sellerId) {
        return false;
      }

      // Sector filter
      if (filters.sector && client.sector !== filters.sector) {
        return false;
      }

      // Sync status
      if (filters.syncStatus !== 'all' && client.syncStatus !== filters.syncStatus) {
        return false;
      }

      // Photos filter
      if (filters.hasPhoto === 'withPhoto' && !client.cedulaFront && !client.cedulaBack) {
        return false;
      }
      if (filters.hasPhoto === 'withoutPhoto' && (client.cedulaFront || client.cedulaBack)) {
        return false;
      }

      // Date range
      if (filters.startDate) {
        const clientDate = client.createdAt.slice(0, 10);
        if (clientDate < filters.startDate) return false;
      }
      if (filters.endDate) {
        const clientDate = client.createdAt.slice(0, 10);
        if (clientDate > filters.endDate) return false;
      }

      return true;
    });
  }, [allClients, filters, activeRole, userProfile]);

  // Selection toggle
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredClients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredClients.map((c) => c.clientId)));
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    const toExport =
      selectedIds.size > 0
        ? filteredClients.filter((c) => selectedIds.has(c.clientId))
        : filteredClients;
    exportClientsToExcel(toExport, 'Reporte_Clientes_PRO');
  };

  // Restore client from Recycle Bin
  const handleRestore = async (client: ClientData) => {
    const restored: ClientData = {
      ...client,
      deletedAt: null,
      deletedBy: null,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending'
    };
    await enqueueClient(restored, 'update');
  };

  return (
    <div className="space-y-5 pb-20">
      {/* Top Header & Actions */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              Expedientes Comerciales
              {filters.showDeleted && (
                <span className="text-xs bg-red-950/80 border border-red-800 text-red-300 font-bold px-2 py-0.5 rounded-full">
                  Papelera de Eliminados
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {filteredClients.length} cliente{filteredClients.length === 1 ? '' : 's'} encontrado{filteredClients.length === 1 ? '' : 's'}
              {activeRole === 'seller' ? ' en tu cartera comercial' : ' en el sistema'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => refreshClients()}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white transition"
              title="Recargar clientes"
            >
              <RefreshCw className={`w-4 h-4 ${loadingClients ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                showFilters || Object.values(filters).some((v) => v !== '' && v !== 'all' && v !== false)
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filtros</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={filteredClients.length === 0}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Exportar Excel {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}</span>
            </button>

            {activeRole === 'admin' && (
              <button
                onClick={() => setFilters((prev) => ({ ...prev, showDeleted: !prev.showDeleted }))}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                  filters.showDeleted
                    ? 'bg-red-600 text-white border-red-500'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{filters.showDeleted ? 'Ver Activos' : 'Papelera'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
            placeholder="Buscar por Nombre, Cédula dominicana, Teléfono o Sector..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>

        {/* Expanded Filters Drawer */}
        {showFilters && (
          <div className="pt-4 border-t border-slate-700/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-xs animate-in slide-in-from-top-2 duration-200">
            {/* Filter by Seller (Admin / Supervisor only) */}
            {activeRole !== 'seller' && (
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Vendedor</label>
                <select
                  value={filters.sellerId}
                  onChange={(e) => setFilters((prev) => ({ ...prev, sellerId: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
                >
                  <option value="">Todos los Vendedores</option>
                  {distinctSellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Filter by Sector */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Sector</label>
              <select
                value={filters.sector}
                onChange={(e) => setFilters((prev) => ({ ...prev, sector: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
              >
                <option value="">Todos los Sectores</option>
                {distinctSectors.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Sync Status */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Estado Sincronización</label>
              <select
                value={filters.syncStatus}
                onChange={(e) => setFilters((prev) => ({ ...prev, syncStatus: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
              >
                <option value="all">Todos los Estados</option>
                <option value="synced">Sincronizado</option>
                <option value="pending">Pendiente de Sincronizar</option>
                <option value="syncing">Sincronizando</option>
              </select>
            </div>

            {/* Filter by Photo presence */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Documento Cédula</label>
              <select
                value={filters.hasPhoto}
                onChange={(e) => setFilters((prev) => ({ ...prev, hasPhoto: e.target.value as any }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
              >
                <option value="all">Con y Sin Fotografía</option>
                <option value="withPhoto">Únicamente con Fotografía</option>
                <option value="withoutPhoto">Sin Fotografía (Manual)</option>
              </select>
            </div>

            {/* Date range Start */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Fecha Desde</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
              />
            </div>

            {/* Date range End */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Fecha Hasta</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
              />
            </div>

            {/* Reset Filters */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={() =>
                  setFilters({
                    searchQuery: '',
                    sellerId: '',
                    supervisorId: '',
                    sector: '',
                    startDate: '',
                    endDate: '',
                    syncStatus: 'all',
                    hasPhoto: 'all',
                    showDeleted: false
                  })
                }
                className="w-full p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Limpiar Filtros
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk actions banner if items are selected */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-950/70 border border-blue-800 rounded-xl p-3 flex items-center justify-between text-xs text-blue-200">
          <span>
            {selectedIds.size} cliente{selectedIds.size === 1 ? '' : 's'} seleccionado{selectedIds.size === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg flex items-center gap-1 shadow"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Descargar Seleccionados en Excel
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-2 py-1 text-slate-400 hover:text-white"
            >
              Deseleccionar
            </button>
          </div>
        </div>
      )}

      {/* Main List Table (Desktop) & Cards (Mobile) */}
      {loadingClients && allClients.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold">Cargando expedientes comerciales...</p>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-12 text-center text-slate-400 space-y-3">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
          <p className="text-base font-bold text-white">No se encontraron clientes</p>
          <p className="text-xs max-w-sm mx-auto">
            {filters.searchQuery || filters.sector || filters.sellerId
              ? 'Intenta ajustar los filtros de búsqueda para ver más resultados.'
              : 'Aún no hay clientes registrados en esta sección. Utiliza el formulario para registrar un cliente.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block bg-slate-900/80 border border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="p-3 w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredClients.length && filteredClients.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                    />
                  </th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Cédula</th>
                  <th className="p-3">Teléfono</th>
                  <th className="p-3">Sector</th>
                  <th className="p-3">GPS</th>
                  <th className="p-3">Foto</th>
                  <th className="p-3">Vendedor</th>
                  <th className="p-3">Sincronización</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredClients.map((client) => {
                  const isSelected = selectedIds.has(client.clientId);
                  return (
                    <tr
                      key={client.clientId}
                      className={`hover:bg-slate-800/50 transition cursor-pointer ${
                        isSelected ? 'bg-blue-950/30' : ''
                      } ${client.deletedAt ? 'opacity-60 bg-red-950/10' : ''}`}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(client.clientId)}
                          className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                        />
                      </td>

                      <td className="p-3" onClick={() => onSelectClient(client)}>
                        <p className="font-bold text-white text-sm">{client.fullName}</p>
                        <p className="text-[11px] text-slate-400">{client.street}, No. {client.localNumber}</p>
                      </td>

                      <td className="p-3 font-mono text-slate-300" onClick={() => onSelectClient(client)}>
                        {client.cedula}
                      </td>

                      <td className="p-3 font-mono text-slate-300" onClick={() => onSelectClient(client)}>
                        {formatDominicanPhone(client.phone)}
                      </td>

                      <td className="p-3 text-slate-300" onClick={() => onSelectClient(client)}>
                        {client.sector}
                      </td>

                      <td className="p-3" onClick={() => onSelectClient(client)}>
                        {client.latitude !== null && client.longitude !== null ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/70">
                            <MapPin className="w-3 h-3" />
                            GPS OK
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">Sin GPS</span>
                        )}
                      </td>

                      <td className="p-3" onClick={() => onSelectClient(client)}>
                        {client.cedulaFront ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/70">
                            <Camera className="w-3 h-3" />
                            Cédula
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">Manual</span>
                        )}
                      </td>

                      <td className="p-3 text-slate-300" onClick={() => onSelectClient(client)}>
                        {client.sellerName}
                      </td>

                      <td className="p-3" onClick={() => onSelectClient(client)}>
                        {client.syncStatus === 'synced' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Sincronizado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
                            <Clock className="w-3 h-3 animate-pulse" /> Pendiente
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {client.deletedAt ? (
                            <button
                              onClick={() => handleRestore(client)}
                              className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded text-[11px] font-bold transition flex items-center gap-1"
                              title="Restaurar de la papelera"
                            >
                              <RotateCcw className="w-3 h-3" /> Restaurar
                            </button>
                          ) : (
                            <button
                              onClick={() => onSelectClient(client)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                              title="Abrir Expediente"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (Optimized for Android Screens) */}
          <div className="lg:hidden space-y-3">
            {filteredClients.map((client) => (
              <div
                key={client.clientId}
                onClick={() => onSelectClient(client)}
                className={`bg-slate-800/80 border rounded-2xl p-4 shadow-sm space-y-3 transition active:scale-[0.99] ${
                  client.deletedAt
                    ? 'border-red-800/60 bg-red-950/10'
                    : 'border-slate-700/80 hover:border-blue-500'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-extrabold text-white text-base leading-snug">{client.fullName}</h3>
                    <p className="text-xs font-mono text-blue-300 mt-0.5">Cédula: {client.cedula}</p>
                  </div>
                  {client.syncStatus === 'synced' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> Sincronizado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-950/80 border border-amber-800 px-2 py-0.5 rounded-full">
                      <Clock className="w-3 h-3" /> Pendiente
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-mono">{formatDominicanPhone(client.phone)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{client.sector}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    {client.latitude !== null && (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> GPS
                      </span>
                    )}
                    {client.cedulaFront && (
                      <span className="text-indigo-400 font-semibold flex items-center gap-1">
                        <Camera className="w-3 h-3" /> Cédula
                      </span>
                    )}
                  </div>

                  <span className="font-medium text-slate-300">{client.sellerName}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
