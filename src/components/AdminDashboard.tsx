import React, { useMemo, useState } from 'react';
import { useSync } from '../context/SyncContext';
import { useAuth } from '../context/AuthContext';
import {
  Users,
  Calendar,
  Clock,
  Camera,
  FileText,
  Shield,
  TrendingUp,
  MapPin,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  PieChart,
  ArrowUpRight
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigateToClients: (filterOption?: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigateToClients }) => {
  const { allClients } = useSync();
  const { activeRole } = useAuth();
  const [timelinePeriod, setTimelinePeriod] = useState<'day' | 'week' | 'month'>('day');

  // Active (non-deleted) clients
  const activeClients = useMemo(() => {
    return allClients.filter((c) => !c.deletedAt);
  }, [allClients]);

  // Statistics Cards Calculation
  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Week calculation: past 7 days
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    // Month calculation: current month YYYY-MM
    const currentMonthStr = todayStr.slice(0, 7);

    let todayCount = 0;
    let weekCount = 0;
    let monthCount = 0;
    let withPhotoCount = 0;
    let withoutPhotoCount = 0;
    let pendingCount = 0;
    const sellersSet = new Set<string>();

    activeClients.forEach((client) => {
      const createdDate = new Date(client.createdAt);
      const dateStr = client.createdAt.slice(0, 10);

      if (dateStr === todayStr) todayCount++;
      if (createdDate >= sevenDaysAgo) weekCount++;
      if (dateStr.startsWith(currentMonthStr)) monthCount++;

      if (client.cedulaFront || client.cedulaBack) withPhotoCount++;
      else withoutPhotoCount++;

      if (client.syncStatus === 'pending') pendingCount++;
      if (client.sellerName) sellersSet.add(client.sellerName);
    });

    return {
      total: activeClients.length,
      today: todayCount,
      week: weekCount,
      month: monthCount,
      withPhoto: withPhotoCount,
      withoutPhoto: withoutPhotoCount,
      activeSellers: sellersSet.size,
      pendingSync: pendingCount,
    };
  }, [activeClients]);

  // Chart 1: Top Sellers Ranking
  const sellerData = useMemo(() => {
    const map = new Map<string, number>();
    activeClients.forEach((c) => {
      const name = c.sellerName || 'Vendedor';
      map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [activeClients]);

  // Chart 2: Sectors / Provinces
  const sectorData = useMemo(() => {
    const map = new Map<string, number>();
    activeClients.forEach((c) => {
      const sec = c.sector || 'Sin Sector';
      map.set(sec, (map.get(sec) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([sector, count]) => ({ sector, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [activeClients]);

  // Chart 3: Timeline (Día, Semana, Mes)
  const timelineData = useMemo(() => {
    const map = new Map<string, number>();

    if (timelinePeriod === 'day') {
      // Last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const key = d.toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric' });
        map.set(key, 0);
      }
      activeClients.forEach((c) => {
        const d = new Date(c.createdAt);
        const key = d.toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric' });
        if (map.has(key)) {
          map.set(key, (map.get(key) || 0) + 1);
        }
      });
    } else if (timelinePeriod === 'week') {
      // Last 4 weeks
      for (let i = 3; i >= 0; i--) {
        const key = `Sem ${4 - i}`;
        map.set(key, 0);
      }
      const now = Date.now();
      activeClients.forEach((c) => {
        const diffDays = Math.floor((now - new Date(c.createdAt).getTime()) / 86400000);
        const weekIndex = Math.floor(diffDays / 7);
        if (weekIndex >= 0 && weekIndex < 4) {
          const key = `Sem ${4 - weekIndex}`;
          if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
        }
      });
    } else {
      // Last 6 months
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = d.toLocaleDateString('es-DO', { month: 'short' });
        map.set(key, 0);
      }
      activeClients.forEach((c) => {
        const d = new Date(c.createdAt);
        const key = d.toLocaleDateString('es-DO', { month: 'short' });
        if (map.has(key)) {
          map.set(key, (map.get(key) || 0) + 1);
        }
      });
    }

    return Array.from(map.entries()).map(([label, count]) => ({ label, count }));
  }, [activeClients, timelinePeriod]);

  const maxTimelineCount = Math.max(...timelineData.map((d) => d.count), 1);
  const maxSellerCount = Math.max(...sellerData.map((d) => d.count), 1);
  const totalSectorsCount = activeClients.length || 1;

  return (
    <div className="space-y-6 pb-20">
      {/* Top Executive Header */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-sm backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 bg-blue-950/60 border border-blue-800/80 px-2.5 py-0.5 rounded-md">
                Panel Central
              </span>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-slate-400">Actualizado en tiempo real</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white mt-1.5 flex items-center gap-2 tracking-tight">
              <TrendingUp className="w-6 h-6 text-blue-400" />
              Métricas y Rendimiento Comercial
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Supervisión de registros, vendedores y cobertura geográfica en República Dominicana
            </p>
          </div>

          <button
            onClick={() => onNavigateToClients()}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition self-start sm:self-auto flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            <span>Ver Todos los Expedientes</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-70" />
          </button>
        </div>
      </div>

      {/* 8 Statistics Cards - High Precision Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Clientes */}
        <div
          onClick={() => onNavigateToClients()}
          className="bg-slate-900/80 border border-slate-800/80 hover:border-blue-500/60 p-4 sm:p-5 rounded-2xl shadow-sm cursor-pointer transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Clientes</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tabular-nums font-mono">{stats.total}</p>
          <p className="text-[11px] text-slate-500 mt-1">Expedientes activos</p>
        </div>

        {/* Card 2: Clientes Hoy */}
        <div className="bg-slate-900/80 border border-slate-800/80 p-4 sm:p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Registrados Hoy</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-2 tabular-nums font-mono">{stats.today}</p>
          <p className="text-[11px] text-slate-500 mt-1">Jornada actual</p>
        </div>

        {/* Card 3: Clientes Esta Semana */}
        <div className="bg-slate-900/80 border border-slate-800/80 p-4 sm:p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Esta Semana</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tabular-nums font-mono">{stats.week}</p>
          <p className="text-[11px] text-slate-500 mt-1">Últimos 7 días</p>
        </div>

        {/* Card 4: Clientes Este Mes */}
        <div className="bg-slate-900/80 border border-slate-800/80 p-4 sm:p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Este Mes</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tabular-nums font-mono">{stats.month}</p>
          <p className="text-[11px] text-slate-500 mt-1">Mes en curso</p>
        </div>

        {/* Card 5: Con Foto de Cédula */}
        <div className="bg-slate-900/80 border border-slate-800/80 p-4 sm:p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Con Cédula</span>
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400">
              <Camera className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tabular-nums font-mono">{stats.withPhoto}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {stats.total > 0 ? Math.round((stats.withPhoto / stats.total) * 100) : 0}% con foto frontal/reverso
          </p>
        </div>

        {/* Card 6: Registro Manual */}
        <div className="bg-slate-900/80 border border-slate-800/80 p-4 sm:p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Registro Manual</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tabular-nums font-mono">{stats.withoutPhoto}</p>
          <p className="text-[11px] text-slate-500 mt-1">Sin fotografía física</p>
        </div>

        {/* Card 7: Vendedores Activos */}
        <div className="bg-slate-900/80 border border-slate-800/80 p-4 sm:p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Vendedores</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tabular-nums font-mono">{stats.activeSellers}</p>
          <p className="text-[11px] text-slate-500 mt-1">Con registros en terreno</p>
        </div>

        {/* Card 8: Sincronización */}
        <div className="bg-slate-900/80 border border-slate-800/80 p-4 sm:p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sincronización</span>
            <div className={`p-2 rounded-xl ${stats.pendingSync === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
              {stats.pendingSync === 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tabular-nums font-mono">
            {stats.pendingSync === 0 ? '100%' : `${stats.pendingSync} pend.`}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {stats.pendingSync === 0 ? 'Todo respaldado en la nube' : 'En cola local de envío'}
          </p>
        </div>
      </div>

      {/* Main Charts & Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline Chart (2 cols) */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-800/80">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                Curva de Registros Comerciales
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Evolución de clientes captados en terreno</p>
            </div>

            {/* Segmented Period Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
              <button
                onClick={() => setTimelinePeriod('day')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  timelinePeriod === 'day' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Día (7D)
              </button>
              <button
                onClick={() => setTimelinePeriod('week')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  timelinePeriod === 'week' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Semana (4S)
              </button>
              <button
                onClick={() => setTimelinePeriod('month')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  timelinePeriod === 'month' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Mes (6M)
              </button>
            </div>
          </div>

          {/* SVG Clean Histogram Visualization */}
          <div className="mt-6 h-52 flex items-end gap-2 sm:gap-4 px-2">
            {timelineData.map((item, idx) => {
              const heightPercent = Math.max((item.count / maxTimelineCount) * 100, 6);
              return (
                <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                  <span className="text-[11px] font-mono font-bold text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity mb-1 tabular-nums">
                    {item.count}
                  </span>
                  <div className="w-full max-w-[48px] bg-slate-800/80 rounded-t-lg overflow-hidden flex flex-col justify-end transition-all group-hover:bg-slate-750">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className="w-full bg-gradient-to-t from-blue-700 via-blue-600 to-indigo-500 rounded-t-lg group-hover:from-blue-600 group-hover:to-indigo-400 transition-all duration-300"
                    />
                  </div>
                  <span className="text-[10px] sm:text-[11px] text-slate-400 mt-2 truncate w-full text-center font-medium">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Sellers Leaderboard (1 col) */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-400" />
                Vendedores Destacados
              </h3>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Top 5</span>
            </div>

            <div className="mt-4 space-y-3.5">
              {sellerData.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No hay registros de vendedores aún
                </div>
              ) : (
                sellerData.map((seller, idx) => {
                  const percent = Math.round((seller.count / maxSellerCount) * 100);
                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className="h-5 w-5 rounded-md bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-slate-200 truncate max-w-[150px]">
                            {seller.name}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-blue-400 tabular-nums">
                          {seller.count} <span className="text-[10px] text-slate-400">regs</span>
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-800/80 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${percent}%` }}
                          className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full transition-all duration-500"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 mt-4 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Productividad total</span>
            <span className="font-mono font-bold text-slate-200 tabular-nums">{stats.total} clientes</span>
          </div>
        </div>
      </div>

      {/* Geographic Breakdown - Dominican Republic Sectors */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-400" />
              Concentración por Zonas y Sectores (RD)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Distribución territorial de la cartera de clientes</p>
          </div>
          <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
            {sectorData.length} sectores mapeados
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {sectorData.length === 0 ? (
            <div className="col-span-full py-8 text-center text-xs text-slate-500">
              No hay sectores registrados todavía
            </div>
          ) : (
            sectorData.map((sec, idx) => {
              const percent = Math.round((sec.count / totalSectorsCount) * 100);
              return (
                <div key={idx} className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white truncate" title={sec.sector}>
                      {sec.sector}
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-400 tabular-nums">
                      {percent}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${percent}%` }}
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 block tabular-nums font-mono">
                    {sec.count} {sec.count === 1 ? 'cliente' : 'clientes'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
