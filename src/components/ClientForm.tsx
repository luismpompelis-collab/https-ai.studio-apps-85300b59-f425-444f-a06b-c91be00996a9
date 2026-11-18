import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { ClientData, GPSLocation } from '../types';
import {
  formatCedula,
  validateDominicanCedula,
  formatDominicanPhone,
  validateDominicanPhone,
  DOMINICAN_SECTORS
} from '../lib/dominicanValidation';
import { CameraCapture } from './CameraCapture';
import { GPSCapture } from './GPSCapture';
import { recordAuditLog } from '../lib/audit';
import { ClientStage } from '../types';
import { sharePlanillaViaWhatsApp } from '../lib/whatsappExport';
import { generateClientPDF } from '../lib/pdfExport';
import {
  UserCheck,
  Send,
  AlertCircle,
  CheckCircle2,
  Phone,
  MapPin,
  Building2,
  FileText,
  Camera,
  Edit3,
  Wifi,
  WifiOff,
  MessageCircle,
  Share2,
  FileDown,
  ArrowRight,
  X
} from 'lucide-react';

interface ClientFormProps {
  initialClient?: ClientData | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const ClientForm: React.FC<ClientFormProps> = ({ initialClient, onSuccess, onCancel }) => {
  const { userProfile } = useAuth();
  const { enqueueClient, allClients, isOnline } = useSync();

  // Mode: 'photo' (Modalidad 1) vs 'manual' (Modalidad 2)
  const [mode, setMode] = useState<'photo' | 'manual'>('photo');

  // Form Fields
  const [fullName, setFullName] = useState(initialClient?.fullName || '');
  const [cedula, setCedula] = useState(initialClient?.cedula || '');
  const [cedulaFront, setCedulaFront] = useState<string | null>(initialClient?.cedulaFront || null);
  const [cedulaBack, setCedulaBack] = useState<string | null>(initialClient?.cedulaBack || null);
  const [phone, setPhone] = useState(initialClient?.phone || '');
  const [secondaryPhone, setSecondaryPhone] = useState(initialClient?.secondaryPhone || '');
  const [sector, setSector] = useState(initialClient?.sector || '');
  const [street, setStreet] = useState(initialClient?.street || '');
  const [localNumber, setLocalNumber] = useState(initialClient?.localNumber || '');
  const [additionalAddress, setAdditionalAddress] = useState(initialClient?.additionalAddress || '');
  const [stage, setStage] = useState<ClientStage>(initialClient?.stage || 'prospecto');

  // GPS
  const [gpsLocation, setGpsLocation] = useState<GPSLocation | null>(
    initialClient && initialClient.latitude !== null && initialClient.longitude !== null
      ? {
          latitude: initialClient.latitude,
          longitude: initialClient.longitude,
          accuracy: initialClient.accuracy || 10,
          capturedAt: initialClient.capturedAt || initialClient.createdAt
        }
      : null
  );

  // Status & Validation
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredClientForShare, setRegisteredClientForShare] = useState<ClientData | null>(null);
  const [submitFeedback, setSubmitFeedback] = useState<{
    status: 'success' | 'offline_saved' | 'error';
    message: string;
  } | null>(null);

  const handleResetAndNext = () => {
    setRegisteredClientForShare(null);
    setFullName('');
    setCedula('');
    setCedulaFront(null);
    setCedulaBack(null);
    setStage('prospecto');
    setPhone('');
    setSecondaryPhone('');
    setSector('');
    setStreet('');
    setLocalNumber('');
    setAdditionalAddress('');
    setGpsLocation(null);
    setErrors({});
    setSubmitFeedback(null);
  };

  // Dominican Cédula formatting on change
  const handleCedulaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCedula(e.target.value);
    setCedula(formatted);
    if (errors.cedula) {
      setErrors((prev) => ({ ...prev, cedula: '' }));
    }
  };

  // Phone formatting
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>, isSecondary = false) => {
    const formatted = formatDominicanPhone(e.target.value);
    if (isSecondary) {
      setSecondaryPhone(formatted);
    } else {
      setPhone(formatted);
      if (errors.phone) {
        setErrors((prev) => ({ ...prev, phone: '' }));
      }
    }
  };

  // Handle OCR extraction callback
  const handleOcrExtracted = (extracted: { cedula?: string; fullName?: string }) => {
    if (extracted.fullName && !fullName) {
      setFullName(extracted.fullName);
    }
    if (extracted.cedula && !cedula) {
      setCedula(extracted.cedula);
    }
  };

  // Validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'El nombre completo es obligatorio.';
    } else if (fullName.trim().length < 3) {
      newErrors.fullName = 'El nombre debe tener al menos 3 caracteres.';
    }

    const cedulaVal = validateDominicanCedula(cedula);
    if (!cedulaVal.isValid) {
      newErrors.cedula = cedulaVal.error || 'Cédula dominicana inválida.';
    } else {
      // Check for duplicate cédula
      const duplicate = allClients.find(
        (c) =>
          c.cedula.replace(/\D/g, '') === cedula.replace(/\D/g, '') &&
          c.clientId !== initialClient?.clientId &&
          !c.deletedAt
      );
      if (duplicate) {
        newErrors.cedula = `Ya existe un cliente con esta cédula (${duplicate.fullName}).`;
      }
    }

    const phoneVal = validateDominicanPhone(phone);
    if (!phoneVal.isValid) {
      newErrors.phone = phoneVal.error || 'Teléfono dominicano inválido.';
    }

    if (secondaryPhone) {
      const secVal = validateDominicanPhone(secondaryPhone);
      if (!secVal.isValid) {
        newErrors.secondaryPhone = secVal.error || 'Teléfono secundario inválido.';
      }
    }

    if (!sector.trim()) {
      newErrors.sector = 'El sector es obligatorio.';
    }
    if (!street.trim()) {
      newErrors.street = 'La calle es obligatoria.';
    }
    if (!localNumber.trim()) {
      newErrors.localNumber = 'El número de local o casa es obligatorio.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    setSubmitFeedback(null);

    const now = new Date().toISOString();
    const isEdit = Boolean(initialClient?.clientId);
    const clientId = initialClient?.clientId || `CLI_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const clientRecord: ClientData = {
      clientId,
      fullName: fullName.trim(),
      cedula: cedula.trim(),
      cedulaFront: cedulaFront || null,
      cedulaBack: cedulaBack || null,
      stage,
      phone: phone.trim(),
      secondaryPhone: secondaryPhone.trim() || undefined,
      sector: sector.trim(),
      street: street.trim(),
      localNumber: localNumber.trim(),
      additionalAddress: additionalAddress.trim() || undefined,
      latitude: gpsLocation ? gpsLocation.latitude : null,
      longitude: gpsLocation ? gpsLocation.longitude : null,
      accuracy: gpsLocation ? gpsLocation.accuracy : null,
      capturedAt: gpsLocation ? gpsLocation.capturedAt : null,
      sellerId: initialClient?.sellerId || userProfile?.uid || 'offline-seller',
      sellerName: initialClient?.sellerName || userProfile?.fullName || 'Vendedor Comercial',
      supervisorId: initialClient?.supervisorId || userProfile?.supervisorId || null,
      createdAt: initialClient?.createdAt || now,
      updatedAt: now,
      syncStatus: isOnline ? 'syncing' : 'pending'
    };

    try {
      await enqueueClient(clientRecord, isEdit ? 'update' : 'create');

      // Mobile haptic feedback on successful capture
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([40, 25, 40]);
      }

      if (userProfile) {
        recordAuditLog(userProfile, isEdit ? 'MODIFICAR' : 'CREAR', {
          clientId,
          clientName: clientRecord.fullName,
          changes: isEdit ? 'Modificación de expediente' : 'Nuevo registro de cliente'
        });
      }

      if (isOnline) {
        setSubmitFeedback({
          status: 'success',
          message: '¡Cliente registrado y sincronizado exitosamente con el servidor central!'
        });
      } else {
        setSubmitFeedback({
          status: 'offline_saved',
          message: 'Sin internet: Expediente guardado de forma segura en tu dispositivo (se enviará automáticamente al reconectar).'
        });
      }

      // If creating new, open WhatsApp / confirmation modal so vendor can share immediately
      if (!isEdit) {
        setRegisteredClientForShare(clientRecord);
      } else {
        setTimeout(() => {
          if (onSuccess) onSuccess();
        }, 1200);
      }
    } catch (err: any) {
      console.error('Submit error:', err);
      setSubmitFeedback({
        status: 'error',
        message: 'Ocurrió un error al guardar. Los datos se conservaron en pantalla para no perderlos.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6 pb-20">
      {/* Title & Mode Switcher */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <UserCheck className="w-6 h-6 text-blue-400" />
              {initialClient ? 'Editar Expediente de Cliente' : 'Registro Oficial de Cliente'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Completa los datos del cliente, fotografía de cédula y geolocalización satelital
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="inline-flex p-1 bg-slate-900 rounded-xl border border-slate-700 text-xs font-semibold self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setMode('photo')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                mode === 'photo' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              Con Fotografía
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                mode === 'manual' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              Manual
            </button>
          </div>
        </div>

        {/* Online / Offline status alert banner inside form */}
        <div className="mt-4 pt-4 border-t border-slate-700/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <Wifi className="w-4 h-4" /> Conectado en línea (Sincronización en tiempo real)
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                <WifiOff className="w-4 h-4" /> Modo Sin Conexión (Los registros se guardarán en tu teléfono)
              </span>
            )}
          </div>
          <span className="text-slate-400 hidden sm:inline">República Dominicana</span>
        </div>
      </div>

      {/* Feedback banner */}
      {submitFeedback && (
        <div
          className={`p-4 rounded-xl flex items-start gap-3 text-sm shadow-md ${
            submitFeedback.status === 'success'
              ? 'bg-emerald-950/80 border border-emerald-700 text-emerald-200'
              : submitFeedback.status === 'offline_saved'
              ? 'bg-amber-950/80 border border-amber-700 text-amber-200'
              : 'bg-red-950/80 border border-red-700 text-red-200'
          }`}
        >
          {submitFeedback.status === 'success' || submitFeedback.status === 'offline_saved' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-bold">{submitFeedback.message}</p>
          </div>
        </div>
      )}

      {/* SECCIÓN A: Documento de Identidad (Fotografías) */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-indigo-600/10 text-indigo-400 rounded-xl">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Sección A: Documento de Identidad</h2>
              <p className="text-xs text-slate-400">
                {mode === 'photo'
                  ? 'Captura el frente y reverso de la cédula para extraer datos automáticamente'
                  : 'Modo manual: las fotografías son opcionales'}
              </p>
            </div>
          </div>
          {mode === 'photo' && (
            <span className="text-[11px] font-bold text-indigo-400 bg-indigo-950/60 border border-indigo-800/70 px-2.5 py-0.5 rounded-lg">
              OCR Inteligente Activo
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <CameraCapture
            label="Frente de la Cédula"
            subLabel="Fotografía clara del lado frontal"
            image={cedulaFront}
            onImageCaptured={setCedulaFront}
            onOcrExtracted={handleOcrExtracted}
            disabled={isSubmitting}
          />
          <CameraCapture
            label="Reverso de la Cédula (Opcional)"
            subLabel="Fotografía del código de barras o reverso"
            image={cedulaBack}
            onImageCaptured={setCedulaBack}
            disabled={isSubmitting}
          />
        </div>
      </div>

      {/* SECCIÓN B: Información del Cliente */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center space-x-2">
          <div className="p-2 bg-blue-600/10 text-blue-400 rounded-xl">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Sección B: Datos del Cliente y Ubicación</h2>
            <p className="text-xs text-slate-400">Información verificada del titular y local comercial</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Nombre Completo */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Nombre Completo del Cliente <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: '' }));
              }}
              placeholder="Ej: Manuel Alejandro Castillo Peña"
              className={`w-full bg-slate-900 border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                errors.fullName ? 'border-red-500' : 'border-slate-700'
              }`}
            />
            {errors.fullName && <p className="text-xs text-red-400 mt-1">{errors.fullName}</p>}
          </div>

          {/* Cédula */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Cédula Dominicana (11 dígitos) <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={cedula}
              onChange={handleCedulaChange}
              maxLength={13}
              placeholder="001-0000000-0"
              className={`w-full bg-slate-900 border rounded-xl px-3.5 py-2.5 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                errors.cedula ? 'border-red-500' : 'border-slate-700'
              }`}
            />
            {cedula.replace(/\D/g, '').length === 11 && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                {validateDominicanCedula(cedula).isValid ? (
                  <span className="text-emerald-400 flex items-center gap-1 font-semibold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Cédula JCE Válida (Algoritmo Módulo 10 verificado)
                  </span>
                ) : (
                  <span className="text-red-400 flex items-center gap-1 font-semibold text-[11px]">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                    Dígito verificador JCE inválido según padrón
                  </span>
                )}
              </div>
            )}
            {errors.cedula && <p className="text-xs text-red-400 mt-1">{errors.cedula}</p>}
          </div>

          {/* Teléfono Principal */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Teléfono Principal <span className="text-red-400">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => handlePhoneChange(e, false)}
              maxLength={14}
              placeholder="(809) 555-0123"
              className={`w-full bg-slate-900 border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                errors.phone ? 'border-red-500' : 'border-slate-700'
              }`}
            />
            {errors.phone && <p className="text-xs text-red-400 mt-1">{errors.phone}</p>}
          </div>

          {/* Teléfono Secundario */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Teléfono Secundario (Opcional)
            </label>
            <input
              type="tel"
              value={secondaryPhone}
              onChange={(e) => handlePhoneChange(e, true)}
              maxLength={14}
              placeholder="(829) 555-9876"
              className={`w-full bg-slate-900 border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                errors.secondaryPhone ? 'border-red-500' : 'border-slate-700'
              }`}
            />
            {errors.secondaryPhone && <p className="text-xs text-red-400 mt-1">{errors.secondaryPhone}</p>}
          </div>

          {/* Sector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Sector / Municipio <span className="text-red-400">*</span>
            </label>
            <input
              list="dominican-sectors"
              value={sector}
              onChange={(e) => {
                setSector(e.target.value);
                if (errors.sector) setErrors((prev) => ({ ...prev, sector: '' }));
              }}
              placeholder="Ej: Piantini, Bella Vista, Naco..."
              className={`w-full bg-slate-900 border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                errors.sector ? 'border-red-500' : 'border-slate-700'
              }`}
            />
            <datalist id="dominican-sectors">
              {DOMINICAN_SECTORS.map((sec) => (
                <option key={sec} value={sec} />
              ))}
            </datalist>
            {errors.sector && <p className="text-xs text-red-400 mt-1">{errors.sector}</p>}
          </div>

          {/* Calle */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Nombre de la Calle / Avenida <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={street}
              onChange={(e) => {
                setStreet(e.target.value);
                if (errors.street) setErrors((prev) => ({ ...prev, street: '' }));
              }}
              placeholder="Ej: Av. Winston Churchill"
              className={`w-full bg-slate-900 border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                errors.street ? 'border-red-500' : 'border-slate-700'
              }`}
            />
            {errors.street && <p className="text-xs text-red-400 mt-1">{errors.street}</p>}
          </div>

          {/* Número de local */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Número del Local o Casa <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={localNumber}
              onChange={(e) => {
                setLocalNumber(e.target.value);
                if (errors.localNumber) setErrors((prev) => ({ ...prev, localNumber: '' }));
              }}
              placeholder="Ej: 14-B o Local 201"
              className={`w-full bg-slate-900 border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                errors.localNumber ? 'border-red-500' : 'border-slate-700'
              }`}
            />
            {errors.localNumber && <p className="text-xs text-red-400 mt-1">{errors.localNumber}</p>}
          </div>

          {/* Dirección adicional o referencia */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
              Referencia o Dirección Adicional (Opcional)
            </label>
            <input
              type="text"
              value={additionalAddress}
              onChange={(e) => setAdditionalAddress(e.target.value)}
              placeholder="Ej: Casi esquina 27 de Febrero, al lado de la farmacia"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
        </div>
      </div>

      {/* SECCIÓN C: Georreferencia GPS */}
      <GPSCapture
        location={gpsLocation}
        onLocationChange={setGpsLocation}
        disabled={isSubmitting}
      />

      {/* Submit Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold text-sm transition"
          >
            Cancelar
          </button>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm tracking-wide shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>GUARDANDO EXPEDIENTE...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>ENVIAR DATOS DEL CLIENTE</span>
            </>
          )}
        </button>
      </div>
      {/* Post-Registration Success & WhatsApp Share Modal */}
      {registeredClientForShare && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5 text-center">
            <div className="h-16 w-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-500/10">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div>
              <h2 className="text-xl font-black text-white">¡Cliente Registrado con Éxito!</h2>
              <p className="text-xs text-slate-300 mt-1">
                Los datos fueron transmitidos a la Base de Datos Central. Tu Supervisor y el Administrador ya tienen acceso a este expediente en sus paneles.
              </p>
            </div>

            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 text-left text-xs space-y-1">
              <p className="font-bold text-white text-sm">{registeredClientForShare.fullName}</p>
              <p className="text-slate-400 font-mono">Cédula: {registeredClientForShare.cedula}</p>
              <p className="text-slate-400">Sector: {registeredClientForShare.sector}</p>
              {registeredClientForShare.latitude && (
                <p className="text-emerald-400 font-mono text-[11px]">
                  GPS Satelital: {registeredClientForShare.latitude.toFixed(6)}, {registeredClientForShare.longitude?.toFixed(6)}
                </p>
              )}
            </div>

            <div className="space-y-2.5 pt-1">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-left">
                ¿Deseas enviar la planilla por WhatsApp?
              </p>

              {/* Share to Supervisor/Admin */}
              <button
                type="button"
                onClick={() => sharePlanillaViaWhatsApp(registeredClientForShare)}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Enviar Planilla a Supervisor / Admin por WhatsApp</span>
              </button>

              {/* Share to Customer */}
              <button
                type="button"
                onClick={() => sharePlanillaViaWhatsApp(registeredClientForShare, registeredClientForShare.phone)}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 hover:text-white font-bold text-xs transition flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4 text-emerald-400" />
                <span>Enviar Comprobante al Cliente por WhatsApp</span>
              </button>

              {/* Download PDF */}
              <button
                type="button"
                onClick={() => generateClientPDF(registeredClientForShare)}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 hover:text-white font-bold text-xs transition flex items-center justify-center gap-2"
              >
                <FileDown className="w-4 h-4 text-blue-400" />
                <span>Descargar Expediente Oficial en PDF</span>
              </button>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleResetAndNext}
                className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow flex items-center justify-center gap-1.5"
              >
                <span>Registrar Siguiente Cliente</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  handleResetAndNext();
                  if (onSuccess) onSuccess();
                }}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 font-bold text-xs transition"
              >
                Ver en Expedientes
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
};
