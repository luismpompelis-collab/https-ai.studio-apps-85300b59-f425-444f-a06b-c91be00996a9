import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Map as GoogleMap,
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  Pin,
  InfoWindow,
  useMap,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  APILoadingStatus
} from '@vis.gl/react-google-maps';
import { ClientData } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import {
  GOOGLE_MAPS_API_KEY,
  GMP_MAP_ID,
  GMP_ATTRIBUTION_IDS,
  DR_DEFAULT_CENTER
} from '../lib/googleMaps';
import {
  Navigation,
  MessageCircle,
  Search,
  Compass,
  MapPin,
  AlertTriangle,
  Eye
} from 'lucide-react';

interface ClientMapViewProps {
  onSelectClient: (client: ClientData) => void;
}

interface ClientMarkerProps {
  client: ClientData;
  zIndex: number;
  isSelected: boolean;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onMarkerClick: (
    client: ClientData,
    marker: google.maps.marker.AdvancedMarkerElement
  ) => void;
}

const ClientAdvancedMarker: React.FC<ClientMarkerProps> = ({
  client,
  zIndex,
  isSelected,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onMarkerClick
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  const isVerified = client.stage === 'aprobado' || client.stage === 'verificado';
  const pinColor = isSelected ? '#f59e0b' : isVerified ? '#10b981' : '#3b82f6';
  const borderColor = isSelected ? '#78350f' : isVerified ? '#065f46' : '#1e3a8a';

  return (
    <AdvancedMarker
      ref={markerRef}
      position={{ lat: client.latitude!, lng: client.longitude! }}
      zIndex={zIndex}
      title={client.fullName}
      onClick={() => {
        if (marker) {
          onMarkerClick(client, marker);
        }
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        transform: `scale(${isSelected || isHovered ? 1.2 : 1})`,
        transformOrigin: AdvancedMarkerAnchorPoint.BOTTOM.join(' ')
      }}
    >
      <Pin
        background={pinColor}
        borderColor={borderColor}
        glyphColor="#ffffff"
        scale={isSelected ? 1.15 : 1}
      />
    </AdvancedMarker>
  );
};

interface ViewportControllerProps {
  clients: ClientData[];
  recenterSignal: number;
}

const MapViewportController: React.FC<ViewportControllerProps> = ({
  clients,
  recenterSignal
}) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    if (clients.length === 0) {
      map.setCenter(DR_DEFAULT_CENTER);
      map.setZoom(8);
      return;
    }

    if (clients.length === 1) {
      const only = clients[0];
      map.setCenter({ lat: only.latitude!, lng: only.longitude! });
      map.setZoom(15);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    clients.forEach((c) => {
      if (c.latitude !== null && c.longitude !== null) {
        bounds.extend({ lat: c.latitude, lng: c.longitude });
      }
    });
    map.fitBounds(bounds, 50);
  }, [map, clients, recenterSignal]);

  return null;
};

export const ClientMapView: React.FC<ClientMapViewProps> = ({ onSelectClient }) => {
  const { allClients } = useSync();
  const { activeRole, userProfile } = useAuth();
  const apiStatus = useApiLoadingStatus();

  const [search, setSearch] = useState('');
  const [selectedSeller, setSelectedSeller] = useState('');
  const [activeStage, setActiveStage] = useState<string>('all');
  const [recenterSignal, setRecenterSignal] = useState(0);

  const [selectedClient, setSelectedClient] = useState<ClientData | null>(null);
  const [selectedMarker, setSelectedMarker] =
    useState<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [hoveredClientId, setHoveredClientId] = useState<string | null>(null);

  useEffect(() => {
    if (apiStatus === APILoadingStatus.AUTH_FAILURE) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }, [apiStatus]);

  // Filter clients with valid GPS coordinates
  const geocodedClients = useMemo(() => {
    const filtered = allClients.filter((c) => {
      if (c.deletedAt) return false;
      if (c.latitude === null || c.longitude === null) return false;
      if (Number.isNaN(c.latitude) || Number.isNaN(c.longitude)) return false;

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

    // Sort descending by latitude so southern markers render visually in front
    return [...filtered].sort((a, b) => (b.latitude ?? 0) - (a.latitude ?? 0));
  }, [allClients, activeRole, userProfile, selectedSeller, activeStage, search]);

  // Distinct sellers (avoid shadowing global Map constructor)
  const distinctSellers = useMemo(() => {
    const sellerIndex: Record<string, string> = {};
    allClients.forEach((c) => {
      if (c.sellerId && c.sellerName) {
        sellerIndex[c.sellerId] = c.sellerName;
      }
    });
    return Object.entries(sellerIndex).map(([id, name]) => ({ id, name }));
  }, [allClients]);

  const handleMarkerClick = useCallback(
    (client: ClientData, marker: google.maps.marker.AdvancedMarkerElement) => {
      setSelectedClient(client);
      setSelectedMarker(marker);
    },
    []
  );

  const handleMapClick = useCallback(() => {
    setSelectedClient(null);
    setSelectedMarker(null);
  }, []);

  const handleInfoWindowClose = useCallback(() => {
    setSelectedClient(null);
    setSelectedMarker(null);
  }, []);

  const handleRecenter = () => {
    setRecenterSignal((prev) => prev + 1);
  };

  const zIndexSelected = geocodedClients.length + 10;
  const zIndexHover = geocodedClients.length + 5;

  const cleanPhone = selectedClient ? (selectedClient.phone || '').replace(/\D/g, '') : '';
  const whatsAppUrl = selectedClient
    ? `https://wa.me/1${cleanPhone}?text=${encodeURIComponent(
        `Hola ${selectedClient.fullName}, le contactamos de CLIENTES PRO.`
      )}`
    : '';
  const googleMapsUrl = selectedClient
    ? `https://www.google.com/maps/dir/?api=1&destination=${selectedClient.latitude},${selectedClient.longitude}`
    : '';
  const wazeUrl = selectedClient
    ? `https://waze.com/ul?ll=${selectedClient.latitude},${selectedClient.longitude}&navigate=yes`
    : '';

  return (
    <div className="space-y-4 pb-20">
      {/* Map Control Header */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                Google Maps Platform · Satelital
              </span>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-slate-400">República Dominicana</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white mt-1 flex items-center gap-2 tracking-tight">
              <Compass className="w-6 h-6 text-emerald-400" />
              Radar Comercial e Interactivo de Clientes
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Visualiza {geocodedClients.length} de {allClients.filter((c) => !c.deletedAt).length} clientes georreferenciados en el territorio nacional
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
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
        {!GOOGLE_MAPS_API_KEY ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3 bg-slate-900/60">
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-white">Google Maps no está configurado</h3>
            <p className="text-xs text-slate-400 max-w-md">
              No se detectó la clave de Google Maps Platform en el entorno (`VITE_GOOGLE_MAPS_API_KEY`). Verifica la configuración del proyecto.
            </p>
          </div>
        ) : apiStatus === APILoadingStatus.FAILED || apiStatus === APILoadingStatus.AUTH_FAILURE ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3 bg-slate-900/60">
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-white">No se pudo cargar Google Maps</h3>
            <p className="text-xs text-slate-400 max-w-md">
              Revisa tu conexión o la cuota de la API de Google Maps Platform. Puedes seguir consultando tus clientes en la pestaña de Expedientes.
            </p>
          </div>
        ) : (
          <GoogleMap
            mapId={GMP_MAP_ID}
            defaultCenter={DR_DEFAULT_CENTER}
            defaultZoom={8}
            gestureHandling="greedy"
            mapTypeControl={true}
            streetViewControl={true}
            fullscreenControl={true}
            clickableIcons={false}
            internalUsageAttributionIds={GMP_ATTRIBUTION_IDS}
            onClick={handleMapClick}
            style={{ width: '100%', height: '100%' }}
          >
            <MapViewportController
              clients={geocodedClients}
              recenterSignal={recenterSignal}
            />

            {geocodedClients.map((client, index) => {
              const isSelected = selectedClient?.clientId === client.clientId;
              const isHovered = hoveredClientId === client.clientId;
              let zIndex = index;
              if (isHovered) zIndex = zIndexHover;
              if (isSelected) zIndex = zIndexSelected;

              return (
                <ClientAdvancedMarker
                  key={client.clientId}
                  client={client}
                  zIndex={zIndex}
                  isSelected={isSelected}
                  isHovered={isHovered}
                  onMouseEnter={() => setHoveredClientId(client.clientId)}
                  onMouseLeave={() => setHoveredClientId(null)}
                  onMarkerClick={handleMarkerClick}
                />
              );
            })}

            {selectedClient && selectedMarker && (
              <InfoWindow
                anchor={selectedMarker}
                onCloseClick={handleInfoWindowClose}
                maxWidth={290}
              >
                <div className="p-1 text-slate-900 min-w-[220px] font-sans">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="text-sm font-extrabold text-slate-900 leading-tight">
                      {selectedClient.fullName}
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono mb-2">
                    Cédula: {selectedClient.cedula}
                  </p>
                  <div className="mb-2.5 text-[11px] text-slate-700 bg-slate-100 p-2 rounded-lg space-y-0.5">
                    <div>
                      <strong>Sector:</strong> {selectedClient.sector}
                    </div>
                    <div>
                      <strong>Calle:</strong> {selectedClient.street}, No. {selectedClient.localNumber}
                    </div>
                  </div>
                  <div className="flex gap-1.5 mb-2">
                    <a
                      href={whatsAppUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 px-2 rounded-md text-[11px] font-bold flex items-center justify-center gap-1 no-underline"
                    >
                      <MessageCircle className="w-3 h-3" />
                      WhatsApp
                    </a>
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center bg-blue-600 hover:bg-blue-500 text-white py-1.5 px-2 rounded-md text-[11px] font-bold flex items-center justify-center gap-1 no-underline"
                    >
                      <MapPin className="w-3 h-3" />
                      Ruta
                    </a>
                    <a
                      href={wazeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center bg-sky-500 hover:bg-sky-400 text-white py-1.5 px-2 rounded-md text-[11px] font-bold flex items-center justify-center gap-1 no-underline"
                    >
                      <Navigation className="w-3 h-3" />
                      Waze
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectClient(selectedClient)}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white py-1.5 px-3 rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Ver Expediente Completo
                  </button>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}

        {/* Floating Quick Legend */}
        <div className="absolute bottom-4 left-4 z-20 bg-slate-950/90 backdrop-blur-md border border-slate-800/80 rounded-xl p-3 text-[11px] text-white shadow-lg space-y-1.5 hidden sm:block">
          <p className="font-bold uppercase tracking-wider text-[10px] text-slate-400">
            Leyenda de Cobertura
          </p>
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
