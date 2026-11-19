import * as XLSX from 'xlsx';
import { ClientData } from '../types';
import { formatDominicanDateTime, formatDominicanPhone } from './dominicanValidation';

export function exportClientsToExcel(clients: ClientData[], filenamePrefix = 'Reporte_Clientes_PRO') {
  const rows = clients.map((c, index) => {
    return {
      'No.': index + 1,
      'ID Sistema': c.clientId,
      'Cédula': c.cedula,
      'Nombre Completo': c.fullName,
      'Teléfono Principal': formatDominicanPhone(c.phone),
      'Teléfono Secundario': c.secondaryPhone ? formatDominicanPhone(c.secondaryPhone) : '',
      'Sector / Zona': c.sector,
      'Calle': c.street,
      'Número Local / Casa': c.localNumber,
      'Referencia / Dirección Adicional': c.additionalAddress || '',
      'GPS Latitud': c.latitude !== null ? c.latitude : '',
      'GPS Longitud': c.longitude !== null ? c.longitude : '',
      'GPS Precisión (Metros)': c.accuracy !== null ? `${c.accuracy.toFixed(1)} m` : '',
      'Fecha Captura GPS': c.capturedAt ? formatDominicanDateTime(c.capturedAt) : '',
      'Enlace Google Maps': c.latitude !== null && c.longitude !== null
        ? `https://www.google.com/maps?q=${c.latitude},${c.longitude}`
        : '',
      'Vendedor': c.sellerName,
      'ID Vendedor': c.sellerId,
      'Administrador': c.adminId || 'Principal',
      'Fecha Creación': formatDominicanDateTime(c.createdAt),
      'Última Modificación': formatDominicanDateTime(c.updatedAt),
      'Tiene Foto Frente': c.cedulaFront ? 'SÍ (Expediente Digital)' : 'NO',
      'Tiene Foto Reverso': c.cedulaBack ? 'SÍ (Expediente Digital)' : 'NO',
      'Estado Sincronización': c.syncStatus.toUpperCase(),
      'Estado Registro': c.deletedAt ? 'ELIMINADO / PAPELERA' : 'ACTIVO'
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Auto-fit column widths
  const colWidths = [
    { wch: 5 },  // No.
    { wch: 22 }, // ID Sistema
    { wch: 16 }, // Cédula
    { wch: 30 }, // Nombre Completo
    { wch: 18 }, // Teléfono Principal
    { wch: 18 }, // Teléfono Secundario
    { wch: 25 }, // Sector
    { wch: 25 }, // Calle
    { wch: 15 }, // Número
    { wch: 35 }, // Referencia
    { wch: 14 }, // Latitud
    { wch: 14 }, // Longitud
    { wch: 18 }, // Precisión
    { wch: 20 }, // Fecha Captura GPS
    { wch: 35 }, // Google Maps Link
    { wch: 25 }, // Vendedor
    { wch: 20 }, // ID Vendedor
    { wch: 18 }, // Administrador
    { wch: 20 }, // Fecha Creación
    { wch: 20 }, // Última Modificación
    { wch: 18 }, // Foto Frente
    { wch: 18 }, // Foto Reverso
    { wch: 18 }, // Sincronización
    { wch: 16 }  // Estado
  ];
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes Registrados');

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${filenamePrefix}_${dateStr}.xlsx`);
}
