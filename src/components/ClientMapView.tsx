import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { ClientData } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { formatDominicanPhone } from '../lib/dominicanValidation';
import {
  MapPin,
  ExternalLink,
  Navigation,
  MessageCircle,
  Eye,
  Search,
  Filter,
  Layers,
  Compass,
  CheckCircle2
} from 'lucide-react';

interface ClientMapViewProps {
  onSelectClient: (client: ClientData) => void;
}

export const ClientMapView: React.FC<ClientMapViewProps> = ({ onSelectClient }) => {
  const { allClients } = useSync();
  const { activeRole, userProfile } = useAuth();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const [search, setSearch] = useState('');
  const [selectedSeller, setSelectedSeller] = useState('');
  const [activeStage, setActiveStage] = useState<string>('all');

  // Filter clients with valid GPS coordinates
  const geocodedClients = useMemo(() => {
    return allClients.filter((c) => {
      if (c.deletedAt) return false;
      if (c.latitude === null || c.longitude === null) return false;
      if (isNaN(c.latitude) || isNaN(c.longitude)) return false;

      // Role filter
      if (activeRole === 'seller' && c.sellerId !== userProfile?.uid) {
        return false;
      }

      if (selectedSeller && c.sellerId !== selectedSeller) return false;
      if (activeStage !== 'all' && (c.stage || 'prospecto') !== activeStage) return false;

      if (search) {
        const q = search.toLowerCase();
        const matchName = c.fullName.toLowerCase().includes(q);
        const matchSector = c.sector.toLowerCase().includes(q);
        const matchCedula = c.cedula.includes(q);
        if (!matchName && !matchSector && !matchCedula) return false;
      }

      return true;
    });
  }, [allClients, activeRole, userProfile, selectedSeller, activeStage, search]);

  // Distinct sellers
  const distinctSellers = useMemo(() => {
    const map = new Map<string, string>();
    allClients.forEach((c) => {
      if (c.sellerId && c.sellerName) map.set(c.sellerId, c.sellerName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allClients]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Center of Dominican Republic: Lat 18.7357, Lng -70.1627
      const map = L.map(mapContainerRef.current, {
        center: [18.7357, -70.1627],
        zoom: 8,
        zoomControl: true
      });

      // CartoDB Dark Matter / Stadia / OSM tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> OpenStreetMap',
        maxZoom: 19
      }).addTo(map);

      const markersGroup = L.layerGroup().addTo(map);
      markersLayerRef.current = markersGroup;
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    const bounds: L.LatLngBounds = L.latLngBounds([]);

    geocodedClients.forEach((client) => {
      if (client.latitude === null || client.longitude === null) return;

      const latLng = L.latLng(client.latitude, client.longitude);
      bounds.extend(latLng);

      // Custom SVG Marker Icon
      const isVerified = client.stage === 'aprobado' || client.stage === 'verificado';
      const pinColor = isVerified ? '#10b981' : '#3b82f6';

      const customIcon = L.divIcon({
        className: 'custom-client-pin',
        html: `
          <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; transform: translate(-50%, -50%);">
            <div style="position: absolute; width: 32px; height: 32px; border-radius: 50%; background: ${pinColor}25; animation: pulse 2s infinite;"></div>
            <div style="position: absolute; width: 22px; height: 22px; border-radius: 50%; background: ${pinColor}; border: 2.5px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff;"></span>
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const cleanPhone = client.phone.replace(/\D/g, '');
      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${client.latitude},${client.longitude}`;
      const wazeUrl = `https://waze.com/ul?ll=${client.latitude},${client.longitude}&navigate=yes`;
      const whatsAppUrl = `https://wa.me/1${cleanPhone}?text=${encodeURIComponent(`Hola ${client.fullName}, le contactamos de CLIENTES PRO.`)}`;

      const popupContent = document.createElement('div');
      popupContent.className = 'p-1 text-slate-900';
      popupContent.innerHTML = `
        <div style="min-width: 210px; font-family: sans-serif;">
          <h4 style="margin: 0 0 2px 0; font-size: 14px; font-weight: 800; color: #0f172a;">${client.fullName}</h4>
          <p style="margin: 0 0 6px 0; font-size: 11px; color: #64748b; font-family: monospace;">Cédula: ${client.cedula}</p>
          <div style="margin-bottom: 8px; font-size: 11px; color: #334155; background: #f1f5f9; padding: 4px 6px; border-radius: 6px;">
            <strong>Sector:</strong> ${client.sector}<br/>
            <strong>Calle:</strong> ${client.street}, No. ${client.localNumber}
          </div>
          <div style="display: flex; gap: 4px; margin-bottom: 8px;">
            <a href="${whatsAppUrl}" target="_blank" rel="noopener noreferrer" style="flex: 1; text-align: center; background: #10b981; color: white; padding: 5px; border-radius: 6px; font-size: 11px; font-weight: bold; text-decoration: none;">
              WhatsApp
            </a>
            <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" style="flex: 1; text-align: center; background: #2563eb; color: white; padding: 5px; border-radius: 6px; font-size: 11px; font-weight: bold; text-decoration: none;">
              Maps
            </a>
            <a href="${wazeUrl}" target="_blank" rel="noopener noreferrer" style="flex: 1; text-align: center; background: #0ea5e9; color: white; padding: 5px; border-radius: 6px; font-size: 11px; font-weight: bold; text-decoration: none;">
              Waze
            </a>
          </div>
          <button id="btn-view-${client.clientId}" style="width: 100%; background: #0f172a; color: white; border: none; padding: 6px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
            Ver Expediente Completo
          </button>
        </div>
      `;

      const marker = L.marker(latLng, { icon: customIcon }).addTo(layer);
      marker.bindPopup(popupContent);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`btn-view-${client.clientId}`);
        if (btn) {
          btn.onclick = () => onSelectClient(client);
        }
      });
    });

    if (geocodedClients.length > 0 && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [geocodedClients, onSelectClient]);

  // Recenter on Dominican Republic
  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      if (geocodedClients.length > 0) {
        const bounds = L.latLngBounds(
          geocodedClients.map((c) => L.latLng(c.latitude!, c.longitude!))
        );
        mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      } else {
        mapInstanceRef.current.setView([18.7357, -70.1627], 8);
      }
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Map Control Header */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                Georreferencia Satelital
              </span>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-slate-400">República Dominicana</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-2 tracking-tight">
              <Compass className="w-6 h-6 text-emerald-400" />
              Radar Comercial e Interactivo de Clientes
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Visualiza {geocodedClients.length} de {allClients.filter(c => !c.deletedAt).length} clientes georreferenciados en el territorio nacional
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={handleRecenter}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center gap-1.5 border border-slate-700"
            >
              <Navigation className="w-3.5 h-3.5 text-blue-400" />
              Centrar Mapa
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-700/60 text-xs">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en el mapa por nombre o sector..."
              className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Seller Filter (Admin / Supervisor) */}
          {activeRole !== 'seller' && (
            <div>
              <select
                value={selectedSeller}
                onChange={(e) => setSelectedSeller(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white"
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

          {/* Stage Filter */}
          <div>
            <select
              value={activeStage}
              onChange={(e) => setActiveStage(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white"
            >
              <option value="all">Todas las Etapas Comerciales</option>
              <option value="aprobado">Aprobados</option>
              <option value="verificado">Verificados</option>
              <option value="prospecto">Prospectos</option>
              <option value="en_revision">En Revisión</option>
            </select>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="relative bg-slate-950 border border-slate-800/80 rounded-2xl shadow-xl overflow-hidden h-[68vh] min-h-[420px]">
        <div ref={mapContainerRef} className="w-full h-full z-10" />

        {/* Floating Quick Legend */}
        <div className="absolute bottom-4 left-4 z-20 bg-slate-950/90 backdrop-blur-md border border-slate-800/80 rounded-xl p-3 text-[11px] text-white shadow-lg space-y-1.5 hidden sm:block">
          <p className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Leyenda de Cobertura</p>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30"></span>
            <span className="text-slate-300">Cliente Verificado / Aprobado</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-500/30"></span>
            <span className="text-slate-300">Prospecto / Comercial</span>
          </div>
        </div>
      </div>
    </div>
  );
};
