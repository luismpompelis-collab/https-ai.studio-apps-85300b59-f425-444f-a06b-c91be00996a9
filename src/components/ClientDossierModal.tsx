import React, { useState, useEffect } from 'react';
import {
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  useApiLoadingStatus,
  APILoadingStatus
} from '@vis.gl/react-google-maps';
import { ClientData, ClientStage, ClientNote } from '../types';
import {
  formatDominicanDateTime,
  formatDominicanPhone
} from '../lib/dominicanValidation';
import { generateClientPDF } from '../lib/pdfExport';
import { sharePlanillaViaWhatsApp } from '../lib/whatsappExport';
import {
  GOOGLE_MAPS_API_KEY,
  GMP_MAP_ID,
  GMP_ATTRIBUTION_IDS
} from '../lib/googleMaps';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import {
  X,
  Copy,
  MapPin,
  ExternalLink,
  FileDown,
  Edit,
  Trash2,
  Check,
  Phone,
  MessageCircle,
  Eye,
  ShieldCheck,
  Calendar,
  User,
  Clock,
  PenTool,
  Navigation,
  Send,
  Plus,
  Sparkles,
  ChevronDown
} from 'lucide-react';

interface ClientDossierModalProps {
  client: ClientData | null;
  onClose: () => void;
  onEdit: (client: ClientData) => void;
}

export const ClientDossierModal: React.FC<ClientDossierModalProps> = ({
  client,
  onClose,
  onEdit
}) => {
  const { activeRole, userProfile } = useAuth();
  const { removeClientLocallyAndRemote, enqueueClient } = useSync();
  const apiStatus = useApiLoadingStatus();

  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedGps, setCopiedGps] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // New enhancements
  const [stage, setStage] = useState<ClientStage>(client?.stage || 'prospecto');
  const [notes, setNotes] = useState<ClientNote[]>(client?.notes || []);
  const [newNoteText, setNewNoteText] = useState('');
  const [showWhatsAppTemplates, setShowWhatsAppTemplates] = useState(false);

  useEffect(() => {
    setStage(client?.stage || 'prospecto');
    setNotes(client?.notes || []);
    setConfirmingDelete(false);
  }, [client?.clientId, client?.stage, client?.notes]);

  if (!client) return null;

  const canEdit =
    activeRole === 'admin' ||
    (activeRole === 'supervisor' && client.supervisorId === userProfile?.uid) ||
    client.sellerId === userProfile?.uid;

  const canDelete = activeRole === 'admin' || client.sellerId === userProfile?.uid;

  // Change stage
  const handleStageChange = async (newStage: ClientStage) => {
    setStage(newStage);
    await enqueueClient({ ...client, stage: newStage, updatedAt: new Date().toISOString() }, 'update');
  };

  // Add commercial note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;

    const noteItem: ClientNote = {
      id: `note_${Date.now()}`,
      authorName: userProfile?.fullName || 'Vendedor Comercial',
      authorRole: activeRole,
      text: newNoteText.trim(),
      date: new Date().toISOString()
    };

    const updated = [noteItem, ...notes];
    setNotes(updated);
    setNewNoteText('');
    await enqueueClient({ ...client, notes: updated, updatedAt: new Date().toISOString() }, 'update');
  };

  // Copy full dossier in formatted structured text
  const handleCopyAll = () => {
    const gpsText =
      client.latitude !== null && client.longitude !== null
        ? `GEORREFERENCIA DEL CLIENTE:\nGPS Latitud: ${client.latitude.toFixed(6)}\nGPS Longitud: ${client.longitude.toFixed(6)}\nPrecisión: ±${client.accuracy ? client.accuracy.toFixed(1) : '0'}m\nGoogle Maps: https://www.google.com/maps?q=${client.latitude},${client.longitude}\nWaze: https://waze.com/ul?ll=${client.latitude},${client.longitude}&navigate=yes`
        : 'GPS: No registrado';

    const fullText = `==============================
EXPEDIENTE DE CLIENTE - CLIENTES PRO
==============================
1. Nombre Completo: ${client.fullName}
2. Cédula: ${client.cedula}
3. Teléfono Principal: ${formatDominicanPhone(client.phone)}
4. Teléfono Secundario: ${client.secondaryPhone ? formatDominicanPhone(client.secondaryPhone) : 'N/A'}
5. Sector: ${client.sector}
6. Calle: ${client.street}
7. No. Local / Casa: ${client.localNumber}
8. Dirección Adicional: ${client.additionalAddress || 'Sin referencia'}
------------------------------
${gpsText}
------------------------------
Etapa Comercial: ${stage.toUpperCase()}
Vendedor Asignado: ${client.sellerName} (ID: ${client.sellerId})
Fecha y Hora de Registro: ${formatDominicanDateTime(client.createdAt)}
Última Modificación: ${formatDominicanDateTime(client.updatedAt)}
ID Expediente: ${client.clientId}
Estado de Sincronización: ${client.syncStatus.toUpperCase()}
==============================`;

    navigator.clipboard.writeText(fullText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  // Copy GPS only
  const handleCopyGps = () => {
    if (client.latitude === null || client.longitude === null) return;
    const gpsText = `GPS: Latitud: ${client.latitude.toFixed(6)}, Longitud: ${client.longitude.toFixed(6)} | Maps: https://www.google.com/maps?q=${client.latitude},${client.longitude}`;
    navigator.clipboard.writeText(gpsText);
    setCopiedGps(true);
    setTimeout(() => setCopiedGps(false), 2500);
  };

  // Soft delete client
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await removeClientLocallyAndRemote(client.clientId);
      setConfirmingDelete(false);
      onClose();
    } catch (e) {
      console.error('Delete error:', e);
    } finally {
      setIsDeleting(false);
    }
  };

  // WhatsApp quick messages
  const cleanPhone = (client.phone || '').replace(/\D/g, '');
  const sendWhatsApp = (msg: string) => {
    const url = `https://wa.me/1${cleanPhone}?text=${encodeURIComponent(msg)}`;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowWhatsAppTemplates(false);
  };

  const getStageBadge = (st: ClientStage) => {
    switch (st) {
      case 'aprobado':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
      case 'verificado':
        return 'bg-blue-950/80 text-blue-300 border-blue-800';
      case 'en_revision':
        return 'bg-amber-950/80 text-amber-300 border-amber-800';
      case 'rechazado':
        return 'bg-rose-950/80 text-rose-300 border-rose-800';
      default:
        return 'bg-purple-950/80 text-purple-300 border-purple-800';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 flex items-center justify-center p-3 sm:p-6 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">Expediente Individual del Cliente</h2>
                {/* Commercial Stage selector */}
                <select
                  value={stage}
                  onChange={(e) => handleStageChange(e.target.value as ClientStage)}
                  className={`text-[11px] font-bold uppercase rounded-lg px-2 py-0.5 border cursor-pointer ${getStageBadge(stage)}`}
                >
                  <option value="prospecto">Prospecto</option>
                  <option value="verificado">Verificado</option>
                  <option value="aprobado">Aprobado</option>
                  <option value="en_revision">En Revisión</option>
                  <option value="rechazado">Rechazado</option>
                </select>
              </div>
              <p className="text-xs text-slate-400">ID Único: <span className="font-mono text-slate-300">{client.clientId}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Follows exact order specified in section 8 */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {/* 1 & 2: Fotografías de la Cédula */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <span>1 y 2. Documentos de Identidad (Fotografías)</span>
            </h3>
            {client.cedulaFront || client.cedulaBack ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {client.cedulaFront && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-300">1. Frente de la Cédula</p>
                    <div
                      onClick={() => setZoomImage(client.cedulaFront!)}
                      className="group relative cursor-pointer aspect-[16/10] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 hover:border-blue-500 transition shadow"
                    >
                      <img
                        src={client.cedulaFront}
                        alt="Frente Cédula"
                        className="w-full h-full object-cover group-hover:scale-102 transition duration-300"
                      />
                      <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-bold gap-1.5">
                        <Eye className="w-4 h-4" /> Ver en Grande
                      </div>
                    </div>
                  </div>
                )}

                {client.cedulaBack && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-300">2. Reverso de la Cédula</p>
                    <div
                      onClick={() => setZoomImage(client.cedulaBack!)}
                      className="group relative cursor-pointer aspect-[16/10] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 hover:border-blue-500 transition shadow"
                    >
                      <img
                        src={client.cedulaBack}
                        alt="Reverso Cédula"
                        className="w-full h-full object-cover group-hover:scale-102 transition duration-300"
                      />
                      <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-bold gap-1.5">
                        <Eye className="w-4 h-4" /> Ver en Grande
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-slate-800/40 border border-slate-800 rounded-xl text-center text-xs text-slate-400 italic">
                Este cliente fue registrado mediante la modalidad manual sin fotografía de cédula.
              </div>
            )}
          </div>

          {/* 3 a 10: Datos Personales y Dirección */}
          <div className="bg-slate-800/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400">
              Datos Personales y Ubicación Comercial
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">3. Nombre Completo</p>
                <p className="text-base font-extrabold text-white mt-0.5">{client.fullName}</p>
              </div>

              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">4. Número de Cédula</p>
                <p className="text-base font-mono font-bold text-blue-300 mt-0.5">{client.cedula}</p>
              </div>

              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">5. Teléfono Principal</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-bold text-white font-mono">{formatDominicanPhone(client.phone)}</span>
                  <a
                    href={`tel:${client.phone.replace(/\D/g, '')}`}
                    className="p-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white transition"
                    title="Llamar"
                  >
                    <Phone className="w-3.5 h-3.5" />
                  </a>

                  {/* WhatsApp Quick Message Menu */}
                  <div className="relative">
                    <button
                      onClick={() => setShowWhatsAppTemplates(!showWhatsAppTemplates)}
                      className="px-2 py-1 rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white transition text-xs font-bold flex items-center gap-1"
                      title="Opciones de WhatsApp"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>

                    {showWhatsAppTemplates && (
                      <div className="absolute left-0 mt-1 w-64 bg-slate-850 border border-slate-700 rounded-xl shadow-2xl p-2 z-30 space-y-1 text-xs">
                        <button
                          onClick={() => sendWhatsApp(`Hola ${client.fullName}, le contactamos de CLIENTES PRO para darle la bienvenida y confirmar su registro comercial.`)}
                          className="w-full text-left p-2 rounded-lg hover:bg-slate-800 text-slate-200 transition"
                        >
                          👋 <strong>Bienvenida Oficial</strong>
                        </button>
                        <button
                          onClick={() => sendWhatsApp(`Hola ${client.fullName}, confirmamos el registro de su negocio en ${client.sector}. Cédula: ${client.cedula}. ¡Estamos a su orden!`)}
                          className="w-full text-left p-2 rounded-lg hover:bg-slate-800 text-slate-200 transition"
                        >
                          📋 <strong>Confirmación de Expediente</strong>
                        </button>
                        <button
                          onClick={() => sendWhatsApp(`Hola ${client.fullName}, le recordamos la visita comercial programada por nuestro equipo de ventas.`)}
                          className="w-full text-left p-2 rounded-lg hover:bg-slate-800 text-slate-200 transition"
                        >
                          📅 <strong>Recordatorio de Visita</strong>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">6. Teléfono Secundario</p>
                <p className="text-sm text-slate-300 font-mono mt-0.5">
                  {client.secondaryPhone ? formatDominicanPhone(client.secondaryPhone) : 'No registrado'}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">7. Sector</p>
                <p className="text-sm font-semibold text-white mt-0.5">{client.sector}</p>
              </div>

              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">8. Calle y 9. No. Local</p>
                <p className="text-sm font-semibold text-white mt-0.5">
                  {client.street}, No. {client.localNumber}
                </p>
              </div>

              <div className="sm:col-span-2">
                <p className="text-xs text-slate-400 uppercase font-semibold">10. Dirección Adicional / Referencia</p>
                <p className="text-sm text-slate-300 mt-0.5 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                  {client.additionalAddress || 'Sin indicaciones adicionales proporcionadas.'}
                </p>
              </div>
            </div>
          </div>

          {/* 11. Georreferencia GPS */}
          <div className="bg-slate-850 border border-slate-700/80 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-blue-600/20 text-blue-400 rounded-lg">
                  <MapPin className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  11. GEORREFERENCIA DEL CLIENTE
                </h3>
              </div>
              {client.latitude !== null && client.longitude !== null && (
                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded">
                  GPS Satelital Confirmado
                </span>
              )}
            </div>

            {client.latitude !== null && client.longitude !== null ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                    <p className="text-[11px] text-slate-400 font-bold uppercase">GPS: Latitud</p>
                    <p className="font-mono text-base font-extrabold text-white mt-0.5">
                      {client.latitude.toFixed(6)}
                    </p>
                  </div>

                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                    <p className="text-[11px] text-slate-400 font-bold uppercase">GPS: Longitud</p>
                    <p className="font-mono text-base font-extrabold text-white mt-0.5">
                      {client.longitude.toFixed(6)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 pt-1 gap-2">
                  <span>
                    Precisión GPS: ±{client.accuracy ? client.accuracy.toFixed(1) : '0'} metros | Captura:{' '}
                    {client.capturedAt ? formatDominicanDateTime(client.capturedAt) : '-'}
                  </span>
                </div>

                {GOOGLE_MAPS_API_KEY &&
                  apiStatus !== APILoadingStatus.FAILED &&
                  apiStatus !== APILoadingStatus.AUTH_FAILURE && (
                  <div className="h-52 w-full rounded-xl overflow-hidden border border-slate-800 shadow-inner">
                    <GoogleMap
                      key={client.clientId}
                      mapId={GMP_MAP_ID}
                      defaultCenter={{ lat: client.latitude, lng: client.longitude }}
                      defaultZoom={16}
                      gestureHandling="cooperative"
                      mapTypeControl={true}
                      streetViewControl={true}
                      internalUsageAttributionIds={GMP_ATTRIBUTION_IDS}
                      style={{ width: '100%', height: '100%' }}
                    >
                      <AdvancedMarker
                        position={{ lat: client.latitude, lng: client.longitude }}
                        title={client.fullName}
                      >
                        <Pin
                          background={stage === 'aprobado' || stage === 'verificado' ? '#10b981' : '#3b82f6'}
                          borderColor="#ffffff"
                          glyphColor="#ffffff"
                        />
                      </AdvancedMarker>
                    </GoogleMap>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No se registraron coordenadas GPS satelitales para este cliente.</p>
            )}
          </div>

          {/* Bitácora de Visitas y Notas Comerciales */}
          <div className="bg-slate-850 border border-slate-700/80 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
              <span>Bitácora de Visitas Comerciales y Notas</span>
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
                {notes.length}
              </span>
            </h3>

            {/* Note Input */}
            <form onSubmit={handleAddNote} className="flex gap-2">
              <input
                type="text"
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Agregar una nota sobre la visita (ej: local abierto, interesado en catálogo)..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={!newNoteText.trim()}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nota</span>
              </button>
            </form>

            {/* Notes List */}
            {notes.length > 0 ? (
              <div className="space-y-2 pt-2 max-h-44 overflow-y-auto">
                {notes.map((note) => (
                  <div key={note.id} className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-bold text-white">{note.authorName}</span>
                      <span className="text-[10px]">{formatDominicanDateTime(note.date)}</span>
                    </div>
                    <p className="text-slate-300">{note.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic text-center py-2">
                No hay notas de visita registradas aún.
              </p>
            )}
          </div>

          {/* 12 a 14: Metadatos y Auditoría del Registro */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-800/40 p-4 rounded-xl border border-slate-800">
            <div>
              <p className="text-slate-400 font-bold uppercase">12. Vendedor Asignado</p>
              <p className="text-white font-semibold mt-0.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-400" />
                {client.sellerName}
              </p>
            </div>

            <div>
              <p className="text-slate-400 font-bold uppercase">13. Fecha y Hora de Registro</p>
              <p className="text-slate-200 font-semibold mt-0.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {formatDominicanDateTime(client.createdAt)}
              </p>
            </div>

            <div>
              <p className="text-slate-400 font-bold uppercase">14. Última Modificación</p>
              <p className="text-slate-200 font-semibold mt-0.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {formatDominicanDateTime(client.updatedAt)}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Action Buttons Required by Section 8 + Navigation Enhancements */}
        <div className="p-4 bg-slate-850 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          {/* Quick Copy Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopyAll}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold transition flex items-center gap-1.5 border border-slate-700"
            >
              {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedAll ? '¡Información Copiada!' : 'COPIAR TODA LA INFORMACIÓN'}
            </button>

            {client.latitude !== null && client.longitude !== null && (
              <>
                <button
                  onClick={handleCopyGps}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold transition flex items-center gap-1.5 border border-slate-700"
                >
                  {copiedGps ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <MapPin className="w-3.5 h-3.5" />}
                  {copiedGps ? '¡GPS Copiado!' : 'COPIAR SOLAMENTE GPS'}
                </button>

                {/* Google Maps intent */}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${client.latitude},${client.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-bold transition flex items-center gap-1.5 border border-blue-500/30"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  GOOGLE MAPS
                </a>

                {/* Waze intent */}
                <a
                  href={`https://waze.com/ul?ll=${client.latitude},${client.longitude}&navigate=yes`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 text-xs font-bold transition flex items-center gap-1.5 border border-sky-500/30"
                  title="Abrir navegación en Waze"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  WAZE
                </a>
              </>
            )}
          </div>

          {/* Action Operations: PDF, Edit, Delete */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => sharePlanillaViaWhatsApp(client)}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow"
              title="Compartir toda la planilla de este cliente por WhatsApp"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              PLANILLA WHATSAPP
            </button>

            <button
              onClick={() => generateClientPDF(client)}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow"
            >
              <FileDown className="w-3.5 h-3.5" />
              DESCARGAR EXPEDIENTE PDF
            </button>

            {canEdit && (
              <button
                onClick={() => {
                  onClose();
                  onEdit(client);
                }}
                className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold transition flex items-center gap-1.5"
              >
                <Edit className="w-3.5 h-3.5" />
                EDITAR
              </button>
            )}

            {canDelete && (
              confirmingDelete ? (
                <div className="flex items-center gap-1.5 bg-red-950/60 border border-red-800 rounded-lg px-2 py-1">
                  <span className="text-[11px] font-bold text-red-200">¿Eliminar?</span>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold transition"
                  >
                    {isDeleting ? 'Borrando...' : 'Sí, mover a papelera'}
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    disabled={isDeleting}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold transition"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  disabled={isDeleting}
                  className="px-3 py-2 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white text-xs font-bold transition flex items-center gap-1.5 border border-red-500/30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  ELIMINAR
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Expanded High-Resolution Image Zoom Modal */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-60 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setZoomImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img src={zoomImage} alt="Ampliación" className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl" />
            <button
              onClick={() => setZoomImage(null)}
              className="absolute -top-10 right-0 text-white font-bold text-sm bg-slate-800 px-3 py-1 rounded-full flex items-center gap-1"
            >
              <X className="w-4 h-4" /> Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
