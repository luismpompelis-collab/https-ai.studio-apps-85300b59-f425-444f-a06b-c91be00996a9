/**
 * Dominican Republic Business & Identity Validation Helpers
 */

/**
 * Validates a Dominican Republic Cédula using the Junta Central Electoral (JCE) Luhn variant.
 * Standard format: 11 digits (e.g. 001-1234567-8)
 * Weights: [1, 2, 1, 2, 1, 2, 1, 2, 1, 2]
 */
export function validateDominicanCedula(cedula: string): { isValid: boolean; error?: string } {
  if (!cedula) {
    return { isValid: false, error: 'La cédula es requerida' };
  }

  // Remove all non-numeric characters
  const clean = cedula.replace(/\D/g, '');

  if (clean.length !== 11) {
    return { isValid: false, error: 'La cédula debe contener exactamente 11 dígitos' };
  }

  // Common series check (e.g., cannot be all zeros)
  if (/^0{11}$/.test(clean)) {
    return { isValid: false, error: 'Número de cédula inválido' };
  }

  const weights = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;

  for (let i = 0; i < 10; i++) {
    const digit = parseInt(clean[i], 10);
    const weight = weights[i];
    const product = digit * weight;

    // In Dominican JCE Luhn, if product >= 10, sum the digits (e.g., 14 -> 1+4 = 5 or product - 9)
    if (product >= 10) {
      sum += Math.floor(product / 10) + (product % 10);
    } else {
      sum += product;
    }
  }

  const verifierDigit = (10 - (sum % 10)) % 10;
  const providedVerifier = parseInt(clean[10], 10);

  if (verifierDigit !== providedVerifier) {
    return { isValid: false, error: 'Dígito verificador de cédula no coincide (cédula inválida)' };
  }

  return { isValid: true };
}

/**
 * Formats a clean 11-digit string into standard Dominican format: XXX-XXXXXXX-X
 */
export function formatCedula(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10, 11)}`;
}

/**
 * Dominican Phone area codes: 809, 829, 849 (Country code +1)
 */
export function formatDominicanPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  
  // Strip leading 1 if provided as country code
  let clean = digits;
  if (clean.startsWith('1') && clean.length > 10) {
    clean = clean.substring(1);
  }
  clean = clean.slice(0, 10);

  if (clean.length === 0) return '';
  if (clean.length <= 3) return `(${clean}`;
  if (clean.length <= 6) return `(${clean.slice(0, 3)}) ${clean.slice(3)}`;
  return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6, 10)}`;
}

export function validateDominicanPhone(phone: string): { isValid: boolean; error?: string } {
  if (!phone) {
    return { isValid: false, error: 'El teléfono es requerido' };
  }
  const digits = phone.replace(/\D/g, '');
  let localDigits = digits;
  if (localDigits.startsWith('1') && localDigits.length === 11) {
    localDigits = localDigits.substring(1);
  }
  if (localDigits.length !== 10) {
    return { isValid: false, error: 'El teléfono debe tener 10 dígitos (ej: 809-555-1234)' };
  }

  const prefix = localDigits.slice(0, 3);
  if (!['809', '829', '849'].includes(prefix)) {
    return { isValid: false, error: 'El prefijo debe ser dominicano (+1 809, 829 u 849)' };
  }

  return { isValid: true };
}

/**
 * Formats an ISO date into Dominican format: DD/MM/AAAA
 */
export function formatDominicanDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '-';
  }
}

/**
 * Formats an ISO date into Dominican format: DD/MM/AAAA HH:mm:ss
 */
export function formatDominicanDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  } catch {
    return '-';
  }
}

/**
 * Top Dominican Sectors for quick selection & autocomplete
 */
export const DOMINICAN_SECTORS = [
  'Piantini (Distrito Nacional)',
  'Naco (Distrito Nacional)',
  'Bella Vista (Distrito Nacional)',
  'Gazcue (Distrito Nacional)',
  'Zona Colonial (Distrito Nacional)',
  'Evaristo Morales (Distrito Nacional)',
  'Los Prados (Distrito Nacional)',
  'Mirador Norte (Distrito Nacional)',
  'Mirador Sur (Distrito Nacional)',
  'Ensanche Quisqueya (Distrito Nacional)',
  'Villa Mella (Santo Domingo Norte)',
  'Sabana Perdida (Santo Domingo Norte)',
  'Los Mina (Santo Domingo Este)',
  'Alma Rosa (Santo Domingo Este)',
  'Ensanche Ozama (Santo Domingo Este)',
  'Invivienda (Santo Domingo Este)',
  'San Isidro (Santo Domingo Este)',
  'Herrera (Santo Domingo Oeste)',
  'Las Caobas (Santo Domingo Oeste)',
  'Los Alcarrizos',
  'Pedro Brand',
  'Santiago de los Caballeros - Centro',
  'Santiago - Los Jardines',
  'Santiago - Gurabo',
  'La Vega - Centro',
  'San Cristóbal - Centro',
  'San Pedro de Macorís',
  'La Romana',
  'Higüey / Bávaro / Punta Cana',
  'Puerto Plata - Centro'
];
