import { GoogleGenAI } from '@google/genai';
import { formatCedula, validateDominicanCedula } from './dominicanValidation';

export interface OCRAssistResult {
  cedula?: string;
  fullName?: string;
  rawConfidence?: 'high' | 'medium' | 'manual';
  error?: string;
}

/**
 * Extracts Dominican Cédula Number and Full Name from an ID card image using Gemini Vision
 */
export async function extractDominicanCedulaOCR(base64Image: string): Promise<OCRAssistResult> {
  const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? (process.env?.GEMINI_API_KEY || (process.env as any)?.VITE_GEMINI_API_KEY) : '');

  // Extract pure base64 and mime type
  const match = base64Image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  const mimeType = match ? match[1] : 'image/jpeg';
  const data = match ? match[2] : base64Image;

  if (!apiKey) {
    return {
      error: 'La función de OCR requiere clave API en el entorno. Puedes ingresar los datos manualmente.',
      rawConfidence: 'manual'
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data
              }
            },
            {
              text: `Analiza esta fotografía de una Cédula de Identidad y Electoral de la República Dominicana.
Extrae estrictamente los siguientes dos datos en formato JSON:
1. "cedula": El número de cédula de 11 dígitos, con guiones en formato XXX-XXXXXXX-X (por ejemplo 001-1234567-8).
2. "fullName": El nombre completo del ciudadano (Nombres y Apellidos en mayúsculas como figura en el documento).

Responde ÚNICAMENTE con un bloque JSON válido sin markdown adicional:
{
  "cedula": "001-1234567-8",
  "fullName": "JUAN PEREZ GONZALEZ"
}`
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text?.trim() || '{}';
    const jsonStr = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(jsonStr);

    let cleanCedula = parsed.cedula ? formatCedula(parsed.cedula) : undefined;
    if (cleanCedula) {
      const validation = validateDominicanCedula(cleanCedula);
      if (!validation.isValid) {
        // Keep formatted even if checksum was slightly off so user can edit
      }
    }

    return {
      cedula: cleanCedula,
      fullName: parsed.fullName ? parsed.fullName.trim() : undefined,
      rawConfidence: cleanCedula ? 'high' : 'medium'
    };
  } catch (err: any) {
    console.warn('OCR Gemini extraction warning:', err);
    return {
      error: 'No se pudo leer automáticamente la cédula. Por favor escribe los datos manualmente.',
      rawConfidence: 'manual'
    };
  }
}

/**
 * Image compressor utility: compresses image to max dimension 1280px and quality 0.7
 * Ensures photo is clear for zooming and small enough for fast Firestore and IndexedDB storage.
 */
export async function compressImage(fileOrBase64: File | string, maxDimension = 1280, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(typeof fileOrBase64 === 'string' ? fileOrBase64 : '');
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl);
    };
    img.onerror = (e) => reject(e);

    if (typeof fileOrBase64 === 'string') {
      img.src = fileOrBase64;
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        img.src = reader.result as string;
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(fileOrBase64);
    }
  });
}
