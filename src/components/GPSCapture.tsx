import React, { useState } from 'react';
import { MapPin, Navigation, ExternalLink, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { GPSLocation } from '../types';
import { formatDominicanDateTime } from '../lib/dominicanValidation';

interface GPSCaptureProps {
  location: GPSLocation | null;
  onLocationChange: (loc: GPSLocation | null) => void;
  disabled?: boolean;
}

export const GPSCapture: React.FC<GPSCaptureProps> = ({ location, onLocationChange, disabled }) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const captureGPS = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Tu navegador o dispositivo no soporta geolocalización GPS.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation: GPSLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date(position.timestamp || Date.now()).toISOString()
        };
        onLocationChange(newLocation);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setErrorMsg('Permiso de ubicación denegado. Por favor activa el permiso de GPS en tu teléfono.');
            break;
          case error.POSITION_UNAVAILABLE:
            setErrorMsg('Señal GPS no disponible. Asegúrate de tener la ubicación activada en tu dispositivo.');
            break;
          case error.TIMEOUT:
            setErrorMsg('Tiempo de espera agotado al obtener el GPS. Intenta nuevamente.');
            break;
          default:
            setErrorMsg('No se pudo obtener la ubicación GPS real.');
            break;
        }
      },
      options
    );
  };

  const getAccuracyQuality = (accuracy: number) => {
    if (accuracy <= 10) return { label: 'Excelente (±' + accuracy.toFixed(1) + ' m)', color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800' };
    if (accuracy <= 30) return { label: 'Buena (±' + accuracy.toFixed(1) + ' m)', color: 'text-blue-400 bg-blue-950/60 border-blue-800' };
    return { label: 'Aceptable (±' + accuracy.toFixed(1) + ' m)', color: 'text-amber-400 bg-amber-950/60 border-amber-800' };
  };

  return (
    <div className="space-y-4 bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-2 bg-blue-600/10 text-blue-400 rounded-xl">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Georreferencia GPS</h3>
            <p className="text-xs text-slate-400">Captura en tiempo real las coordenadas físicas del local o cliente</p>
          </div>
        </div>

        {location && (
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-950/40 text-emerald-300 border border-emerald-800/60">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            GPS Confirmado
          </span>
        )}
      </div>

      {/* Big Action Button */}
      <button
        type="button"
        onClick={captureGPS}
        disabled={loading || disabled}
        className={`w-full py-3.5 px-4 rounded-xl font-bold text-xs tracking-wider uppercase transition-all shadow-md flex items-center justify-center gap-2.5 ${
          location
            ? 'bg-slate-800 hover:bg-slate-750 text-white border border-slate-700'
            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white active:scale-[0.99] shadow-blue-600/20'
        }`}
      >
        {loading ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin text-white" />
            <span>SOLICITANDO COORDENADAS SATELITALES...</span>
          </>
        ) : location ? (
          <>
            <RefreshCw className="w-4 h-4 text-slate-300" />
            <span>ACTUALIZAR MI UBICACIÓN GPS</span>
          </>
        ) : (
          <>
            <Navigation className="w-4 h-4 text-white" />
            <span>CAPTURAR MI UBICACIÓN GPS</span>
          </>
        )}
      </button>

      {/* Error Message */}
      {errorMsg && (
        <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Captured Result Card */}
      {location ? (
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Coordenadas del Dispositivo</span>
            </div>
            {location.accuracy && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${getAccuracyQuality(location.accuracy).color}`}>
                {getAccuracyQuality(location.accuracy).label}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-800">
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Latitud Real</p>
              <p className="font-mono text-base font-bold text-white mt-0.5">{location.latitude.toFixed(6)}</p>
            </div>
            <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-800">
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Longitud Real</p>
              <p className="font-mono text-base font-bold text-white mt-0.5">{location.longitude.toFixed(6)}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-400 pt-1 gap-2">
            <span>Hora captura: {formatDominicanDateTime(location.capturedAt)}</span>

            <a
              href={`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-semibold hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir en Google Maps
            </a>
          </div>
        </div>
      ) : (
        <p className="text-center text-xs text-slate-400 italic">
          No se ha capturado la ubicación GPS todavía. Presiona el botón arriba para registrar las coordenadas exactas.
        </p>
      )}
    </div>
  );
};
