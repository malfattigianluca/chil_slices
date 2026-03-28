import PDFDocument from 'pdfkit';

interface OrderItem {
  codigo: string;
  descripcion: string;
  cantidad: number;
  cantidadBonificada?: number;
  precioAplicado: number;
  subtotal: number;
  neto: number | null;
  iva: number | null;
  total: number;
  tipoLinea: string;
}

interface OrderForExport {
  id: number;
  nroPedidoDia?: number | null;
  fecha: Date;
  tipoCalculo: string;
  clienteNombre: string | null;
  cliente: { nombre: string; codigo: string } | null;
  vendedor: { name: string } | null;
  priceList: { nombre: string; version: string | null } | null;
  items: OrderItem[];
  subtotalNeto: number;
  ivaTotal: number;
  percepcionIva: number;
  percepcionIibb: number;
  totalFinal: number;
  observaciones: string | null;
}

function formatCurrency(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Genera un PDF del pedido usando PDFKit.
 */
export function generateOrderPDF(order: OrderForExport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const clientName = order.cliente?.nombre ?? order.clienteNombre ?? 'Sin cliente';
    const clientCode = order.cliente?.codigo ?? '-';
    const modeLabel: Record<string, string> = {
      FC_A: 'Factura A', MITAD: 'Mitad FC-A / Remito', Z: 'Lista Z', REMITO: 'Remito',
    };

    // ── Header ──────────────────────────────────────────────
    doc.fontSize(18).font('Helvetica-Bold').text('NOTA DE PEDIDO', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Nro: ${order.id}`, { continued: true });
    doc.text(`   Fecha: ${formatDate(order.fecha)}`, { align: 'right' });
    doc.moveDown(0.3);

    // ── Info cliente / tipo ──────────────────────────────────
    doc.rect(40, doc.y, doc.page.width - 80, 48).stroke();
    const boxY = doc.y + 6;
    const nroLabel = order.nroPedidoDia ? `  |  Nro día: ${order.nroPedidoDia}` : '';
    doc.text(`Cliente: ${clientName} (Cod: ${clientCode})`, 46, boxY);
    doc.text(`Tipo: ${modeLabel[order.tipoCalculo] ?? order.tipoCalculo}${nroLabel}`, 46, boxY + 14);
    doc.text(`Vendedor: ${order.vendedor?.name ?? '-'}`, 46, boxY + 28);
    doc.text(`Lista: ${order.priceList?.nombre ?? '-'} ${order.priceList?.version ?? ''}`, 300, boxY + 14);
    doc.moveDown(3.5);

    const cols = { cod: 40, desc: 110, cant: 310, precio: 385, total: 470 };
    const isMitad = order.tipoCalculo === 'MITAD';

    function drawItemsTable(items: OrderItem[], title?: string) {
      if (title) {
        doc.font('Helvetica-Bold').fontSize(9).text(title, 40, doc.y);
        doc.moveDown(0.3);
      }

      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Cód', cols.cod, headerY);
      doc.text('Descripción', cols.desc, headerY);
      doc.text('Cant', cols.cant, headerY, { width: 70 });
      doc.text('Precio', cols.precio, headerY, { width: 80 });
      doc.text('Total', cols.total, headerY, { width: 70 });
      doc.moveTo(40, headerY + 14).lineTo(doc.page.width - 40, headerY + 14).stroke();

      doc.font('Helvetica').fontSize(8);
      let y = headerY + 18;

      for (const item of items) {
        if (y > doc.page.height - 140) {
          doc.addPage();
          y = 40;
        }
        const bonus = (item.cantidadBonificada ?? 0) > 0 ? `+${item.cantidadBonificada}` : '';
        doc.text(item.codigo, cols.cod, y, { width: 65 });
        doc.text(item.descripcion, cols.desc, y, { width: 195, ellipsis: true });
        doc.text(`${item.cantidad}${bonus}`, cols.cant, y, { width: 70 });
        doc.text(formatCurrency(item.precioAplicado), cols.precio, y, { width: 80 });
        doc.text(formatCurrency(item.total), cols.total, y, { width: 70 });
        y += 14;
      }

      doc.y = y;
    }

    if (isMitad) {
      const groupFCA = order.items.filter((i) => i.tipoLinea === 'FC_A');
      const groupRemito = order.items.filter((i) => i.tipoLinea !== 'FC_A');

      const subtotalFCA = round2(groupFCA.reduce((a, i) => a + i.total, 0));
      const subtotalRemito = round2(groupRemito.reduce((a, i) => a + i.total, 0));

      // FC_A section
      if (groupFCA.length > 0) {
        drawItemsTable(groupFCA, 'FACTURA A');
        let y = doc.y + 6;
        doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke();
        y += 6;
        doc.font('Helvetica').fontSize(9);
        doc.text('Subtotal neto:', cols.precio, y, { width: 80 });
        doc.text(formatCurrency(order.subtotalNeto), cols.total, y, { width: 70 }); y += 13;
        doc.text('IVA:', cols.precio, y, { width: 80 });
        doc.text(formatCurrency(order.ivaTotal), cols.total, y, { width: 70 }); y += 13;
        if (order.percepcionIva > 0) {
          doc.text('Percep. IVA:', cols.precio, y, { width: 80 });
          doc.text(formatCurrency(order.percepcionIva), cols.total, y, { width: 70 }); y += 13;
        }
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text('Subtotal FC A:', cols.precio, y, { width: 80 });
        doc.text(formatCurrency(subtotalFCA + order.percepcionIva + order.percepcionIibb), cols.total, y, { width: 70 });
        doc.y = y + 18;
      }

      // REMITO section
      if (groupRemito.length > 0) {
        drawItemsTable(groupRemito, 'REMITO');
        let y = doc.y + 6;
        doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke();
        y += 6;
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text('Subtotal Remito:', cols.precio, y, { width: 80 });
        doc.text(formatCurrency(subtotalRemito), cols.total, y, { width: 70 });
        doc.y = y + 18;
      }
    } else {
      drawItemsTable(order.items);

      let y = doc.y + 8;
      doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke();
      y += 8;

      doc.font('Helvetica').fontSize(9);
      if (order.subtotalNeto > 0) {
        doc.text('Subtotal Neto:', cols.precio, y, { width: 80 });
        doc.text(formatCurrency(order.subtotalNeto), cols.total, y, { width: 70 }); y += 14;
        doc.text('IVA:', cols.precio, y, { width: 80 });
        doc.text(formatCurrency(order.ivaTotal), cols.total, y, { width: 70 }); y += 14;
        if (order.percepcionIva > 0) {
          doc.text('Percep. IVA:', cols.precio, y, { width: 80 });
          doc.text(formatCurrency(order.percepcionIva), cols.total, y, { width: 70 }); y += 14;
        }
      }
      doc.y = y;
    }

    // Grand total
    let totalY = doc.y;
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('TOTAL:', cols.precio, totalY, { width: 80 });
    doc.text(formatCurrency(order.totalFinal), cols.total, totalY, { width: 70 });

    if (order.observaciones) {
      doc.font('Helvetica').fontSize(8);
      doc.text(`Obs: ${order.observaciones}`, 40, totalY + 24);
    }

    doc.end();
  });
}
