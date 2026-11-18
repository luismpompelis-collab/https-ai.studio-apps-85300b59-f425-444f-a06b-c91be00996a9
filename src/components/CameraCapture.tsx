import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, Upload, X, Check, FlipHorizontal, Sparkles } from 'lucide-react';
import { compressImage, extractDominicanCedulaOCR } from '../lib/ocr';

interface CameraCaptureProps {
  label: string;
  subLabel?: string;
  image: string | null;
  onImageCaptured: (base64: string | null) => void;
  onOcrExtracted?: (extracted: { cedula?: string; fullName?: string }) => void;
  disabled?: boolean;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  label,
  subLabel,
  image,
  onImageCaptured,
  onOcrExtracted,
  disabled
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStreaming(false);
  };

  const startStream = async () => {
    stopStream();
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreaming(true);
      }
    } catch (err) {
      console.warn('Camera stream error, falling back to file input:', err);
      // Fallback: trigger file input
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    }
  };

  useEffect(() => {
    if (isModalOpen) {
      startStream();
    } else {
      stopStream();
    }
    return () => stopStream();
  }, [isModalOpen, facingMode]);

  const captureFrame = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawData = canvas.toDataURL('image/jpeg', 0.9);
    stopStream();
    setIsModalOpen(false);

    // Compress
    const compressed = await compressImage(rawData, 1280, 0.75);
    onImageCaptured(compressed);

    // Run OCR if front photo
    triggerOcrIfSupported(compressed);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImage(file, 1280, 0.75);
      onImageCaptured(compressed);
      triggerOcrIfSupported(compressed);
    } catch (err) {
      console.error('Error compressing uploaded file:', err);
    }
  };

  const triggerOcrIfSupported = async (base64Img: string) => {
    if (!onOcrExtracted) return;
    setIsOcrLoading(true);
    setOcrMessage('Extrayendo datos de la cédula...');
    try {
      const result = await extractDominicanCedulaOCR(base64Img);
      if (result.cedula || result.fullName) {
        onOcrExtracted({ cedula: result.cedula, fullName: result.fullName });
        setOcrMessage('¡Datos leídos exitosamente! Verifica los campos abajo.');
      } else if (result.error) {
        setOcrMessage(result.error);
      }
    } catch {
      setOcrMessage('No se pudo leer automáticamente.');
    } finally {
      setIsOcrLoading(false);
      setTimeout(() => setOcrMessage(null), 4000);
    }
  };

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">{label}</label>
          {subLabel && <p className="text-[11px] text-slate-400">{subLabel}</p>}
        </div>
        {image && (
          <button
            type="button"
            onClick={() => onImageCaptured(null)}
            className="text-xs text-red-400 hover:text-red-300 font-semibold flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            Quitar
          </button>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
      />

      {image ? (
        <div className="relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-900 max-h-48 aspect-[16/10] flex items-center justify-center">
          <img src={image} alt={label} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Repetir Foto
            </button>
            {onOcrExtracted && (
              <button
                type="button"
                onClick={() => triggerOcrIfSupported(image)}
                disabled={isOcrLoading}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isOcrLoading ? 'Leyendo...' : 'Re-escanear Cédula'}
              </button>
            )}
          </div>
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-950/80 text-[10px] text-emerald-400 font-bold border border-emerald-900/50 flex items-center gap-1">
            <Check className="w-3 h-3" />
            Foto Registrada
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsModalOpen(true)}
            className="flex flex-col items-center justify-center p-4 border border-dashed border-slate-700 hover:border-blue-500 rounded-xl bg-slate-800/40 hover:bg-slate-800/90 text-slate-300 hover:text-white transition-all text-xs font-semibold gap-2"
          >
            <div className="p-2.5 rounded-full bg-blue-600/20 text-blue-400">
              <Camera className="w-5 h-5" />
            </div>
            <span>Tomar Foto</span>
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center p-4 border border-dashed border-slate-700 hover:border-slate-500 rounded-xl bg-slate-800/40 hover:bg-slate-800/90 text-slate-300 hover:text-white transition-all text-xs font-semibold gap-2"
          >
            <div className="p-2.5 rounded-full bg-slate-700 text-slate-300">
              <Upload className="w-5 h-5" />
            </div>
            <span>Subir Imagen</span>
          </button>
        </div>
      )}

      {ocrMessage && (
        <div className="text-[11px] text-indigo-300 bg-indigo-950/60 border border-indigo-800/80 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>{ocrMessage}</span>
        </div>
      )}

      {/* Live Camera Viewfinder Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col justify-between p-4">
          <div className="flex items-center justify-between z-10">
            <span className="text-white font-bold text-sm bg-slate-900/80 px-3 py-1 rounded-full border border-slate-700">
              Enfoca el documento ({label})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleCameraFacing}
                className="p-2.5 rounded-full bg-slate-800 text-white hover:bg-slate-700 transition"
                title="Cambiar Cámara (Frontal / Trasera)"
              >
                <FlipHorizontal className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2.5 rounded-full bg-slate-800 text-white hover:bg-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Video Viewport with Cédula ID Card Boundary Guide */}
          <div className="relative flex-1 flex items-center justify-center overflow-hidden my-4 rounded-2xl bg-black">
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Guide overlay */}
            <div className="relative z-10 w-[85%] max-w-sm aspect-[1.586/1] border-2 border-dashed border-blue-400/90 rounded-2xl pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] flex items-center justify-center">
              <span className="text-white/80 font-semibold text-xs tracking-wider bg-black/60 px-3 py-1 rounded-full uppercase">
                Alinea la cédula aquí
              </span>
            </div>
          </div>

          {/* Controls Footer */}
          <div className="flex items-center justify-center py-2 z-10">
            <button
              type="button"
              onClick={captureFrame}
              disabled={!streaming}
              className="h-18 w-18 rounded-full border-4 border-white bg-blue-600 active:scale-95 flex items-center justify-center shadow-xl shadow-blue-600/50"
            >
              <div className="h-14 w-14 rounded-full bg-white flex items-center justify-center">
                <Camera className="w-7 h-7 text-blue-600" />
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
