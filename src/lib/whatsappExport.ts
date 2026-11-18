import { ClientData } from '../types';
import { formatDominicanDateTime, formatDominicanPhone } from './dominicanValidation';

/**
 * Formats a clean, high-impact WhatsApp message containing the complete client registration sheet (Planilla).
 */
export function formatWhatsAppPlanilla(client: ClientData): string {
  const gpsSection =
    client.latitude !== null && client.longitude !== null
      ? `🛰️ *GPS Satelital:* ${client.latitude.toFixed(6)}, ${client.longitude.toFixed(6)} (±${client.accuracy ? client.accuracy.toFixed(1) : '0'}m)\n🗺️ *Ubicación en Google Maps:* https://www.google.com/maps?q=${client.latitude},${client.longitude}\n🚗 *Ruta en Waze:* https://waze.com/ul?ll=${client.latitude},${client.longitude}&navigate=yes`
      : '🛰️ *GPS Satelital:* No capturado';

  const photoInfo = client.cedulaFront
    ? '📸 *Cédula:* Fotografías adjuntas en el expediente digital'
    : '📝 *Cédula:* Registro manual sin fotografía';

  return `📋 *PLANILLA OFICIAL DE REGISTRO - CLIENTES PRO*
━━━━━━━━━━━━━━━━━━━━
👤 *CLIENTE:* ${client.fullName}
🆔 *CÉDULA:* ${client.cedula}
📞 *TELÉFONO PRINCIPAL:* ${formatDominicanPhone(client.phone)}
${client.secondaryPhone ? `📱 *TELÉFONO SECUNDARIO:* ${formatDominicanPhone(client.secondaryPhone)}\n` : ''}📍 *SECTOR / ZONA:* ${client.sector}
🏢 *DIRECCIÓN:* ${client.street}, No. ${client.localNumber}
${client.additionalAddress ? `📝 *REFERENCIA:* ${client.additionalAddress}\n` : ''}━━━━━━━━━━━━━━━━━━━━
${gpsSection}
━━━━━━━━━━━━━━━━━━━━
${photoInfo}
💼 *VENDEDOR:* ${client.sellerName}
📅 *FECHA DE REGISTRO:* ${formatDominicanDateTime(client.createdAt)}
🆔 *ID EXPEDIENTE:* ${client.clientId}
━━━━━━━━━━━━━━━━━━━━
_Transmitido automáticamente desde la app móvil CLIENTES PRO RD_`;
}

/**
 * Opens WhatsApp with the pre-formatted Planilla message.
 * If targetPhone is provided (10 digits Dominican phone), opens direct chat.
 * If not provided, opens WhatsApp contact chooser.
 */
export function sharePlanillaViaWhatsApp(client: ClientData, targetPhone?: string): void {
  const message = formatWhatsAppPlanilla(client);
  const encoded = encodeURIComponent(message);

  let url = `https://api.whatsapp.com/send?text=${encoded}`;
  if (targetPhone) {
    const clean = targetPhone.replace(/\D/g, '');
    const fullPhone = clean.startsWith('1') ? clean : `1${clean}`;
    url = `https://wa.me/${fullPhone}?text=${encoded}`;
  }

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
