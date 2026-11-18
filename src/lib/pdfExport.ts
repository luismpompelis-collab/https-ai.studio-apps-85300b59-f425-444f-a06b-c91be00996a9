import jsPDF from 'jspdf';
import { ClientData } from '../types';
import { formatDominicanDateTime, formatDominicanPhone } from './dominicanValidation';

export async function generateClientPDF(client: ClientData, companyName = 'CLIENTES PRO – Gestión Comercial') {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // Header Banner
  doc.setFillColor(30, 58, 138); // Deep Blue #1e3a8a
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(companyName, 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('EXPEDIENTE OFICIAL DE REGISTRO DE CLIENTE', 14, 18);
  doc.text(`ID: ${client.clientId}`, pageWidth - 14, 12, { align: 'right' });
  doc.text(`Emisión: ${new Date().toLocaleDateString('es-DO')}`, pageWidth - 14, 18, { align: 'right' });

  y = 36;

  // Section 1: Customer Personal Information
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, pageWidth - 28, 8, 'F');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('1. INFORMACIÓN PERSONAL Y DE CONTACTO', 18, y + 5.5);

  y += 12;

  const col1 = 18;
  const col2 = 110;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Nombre Completo:', col1, y);
  doc.setFont('helvetica', 'normal');
  doc.text(client.fullName || '-', col1 + 35, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Cédula de Identidad:', col2, y);
  doc.setFont('helvetica', 'normal');
  doc.text(client.cedula || '-', col2 + 40, y);

  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.text('Teléfono Principal:', col1, y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDominicanPhone(client.phone) || '-', col1 + 35, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Teléfono Secundario:', col2, y);
  doc.setFont('helvetica', 'normal');
  doc.text(client.secondaryPhone ? formatDominicanPhone(client.secondaryPhone) : 'No registrado', col2 + 40, y);

  y += 11;

  // Section 2: Address
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, pageWidth - 28, 8, 'F');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('2. UBICACIÓN Y DIRECCIÓN COMERCIAL', 18, y + 5.5);

  y += 12;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Sector / Municipio:', col1, y);
  doc.setFont('helvetica', 'normal');
  doc.text(client.sector || '-', col1 + 35, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Calle y Número:', col2, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${client.street || '-'}, No. ${client.localNumber || '-'}`, col2 + 40, y);

  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.text('Referencia:', col1, y);
  doc.setFont('helvetica', 'normal');
  doc.text(client.additionalAddress || 'Sin referencia adicional', col1 + 35, y, { maxWidth: pageWidth - 60 });

  y += 12;

  // Section 3: Georeference GPS
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, pageWidth - 28, 8, 'F');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('3. GEORREFERENCIA GPS DEL DISPOSITIVO', 18, y + 5.5);

  y += 12;

  if (client.latitude !== null && client.longitude !== null) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Coordenadas Reales:', col1, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`Lat: ${client.latitude.toFixed(6)}, Lon: ${client.longitude.toFixed(6)}`, col1 + 35, y);

    doc.setFont('helvetica', 'bold');
    doc.text('Precisión GPS:', col2, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`± ${client.accuracy ? client.accuracy.toFixed(1) : '0'} metros`, col2 + 40, y);

    y += 7;

    doc.setFont('helvetica', 'bold');
    doc.text('Fecha Captura GPS:', col1, y);
    doc.setFont('helvetica', 'normal');
    doc.text(client.capturedAt ? formatDominicanDateTime(client.capturedAt) : '-', col1 + 35, y);

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${client.latitude},${client.longitude}`;
    doc.setTextColor(37, 99, 235);
    doc.setFont('helvetica', 'bold');
    doc.textWithLink('[ Ver ubicación en Google Maps ]', col2, y, { url: mapsUrl });
    doc.setTextColor(15, 23, 42);
  } else {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('No se capturaron coordenadas GPS para este cliente.', col1, y);
  }

  y += 12;

  // Section 4: Registration metadata
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, pageWidth - 28, 8, 'F');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('4. AUDITORÍA Y REGISTRO COMERCIAL', 18, y + 5.5);

  y += 12;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Vendedor Asignado:', col1, y);
  doc.setFont('helvetica', 'normal');
  doc.text(client.sellerName || '-', col1 + 35, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Fecha de Creación:', col2, y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDominicanDateTime(client.createdAt), col2 + 40, y);

  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.text('Última Modificación:', col1, y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDominicanDateTime(client.updatedAt), col1 + 35, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Estado Sincronización:', col2, y);
  doc.setFont('helvetica', 'normal');
  doc.text(client.syncStatus.toUpperCase(), col2 + 40, y);

  y += 12;

  // Section 5: ID Photos (if available)
  if (client.cedulaFront || client.cedulaBack) {
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y, pageWidth - 28, 8, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('5. DOCUMENTO DE IDENTIDAD (FOTOGRAFÍAS)', 18, y + 5.5);

    y += 12;

    const imgWidth = 85;
    const imgHeight = 52;

    if (client.cedulaFront) {
      try {
        doc.addImage(client.cedulaFront, 'JPEG', 18, y, imgWidth, imgHeight);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('Frente de Cédula', 18 + imgWidth / 2, y + imgHeight + 4, { align: 'center' });
      } catch (err) {
        console.warn('Could not render front image in PDF:', err);
      }
    }

    if (client.cedulaBack) {
      try {
        doc.addImage(client.cedulaBack, 'JPEG', 108, y, imgWidth, imgHeight);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('Reverso de Cédula', 108 + imgWidth / 2, y + imgHeight + 4, { align: 'center' });
      } catch (err) {
        console.warn('Could not render back image in PDF:', err);
      }
    }

    y += imgHeight + 10;
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 12;
  doc.setDrawColor(203, 213, 225);
  doc.line(14, footerY - 4, pageWidth - 14, footerY - 4);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('CLIENTES PRO – Sistema Profesional de Gestión Comercial. República Dominicana.', 14, footerY);
  doc.text('Confidencial & Seguro', pageWidth - 14, footerY, { align: 'right' });

  // Save/Download
  const cleanName = (client.fullName || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Expediente_${client.cedula || client.clientId}_${cleanName}.pdf`;
  doc.save(filename);
}
