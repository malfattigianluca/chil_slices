import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ordersAPI } from '../services/api';
import { Order, CalcMode } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import ToastContainer from '../components/Toast';
import { useToast } from '../hooks/useToast';

const MODE_LABELS: Record<CalcMode, string> = {
  FC_A: 'Factura A', MITAD: 'Mitad', Z: 'Lista Z', REMITO: 'Remito',
};

function formatCurrency(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
}
function formatDate(d: string) {
  return new Date(d).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function OrderResult() {
  const { id } = useParams<{ id: string }>();
  const { toasts, addToast, removeToast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ordersAPI.getById(parseInt(id!))
      .then(setOrder)
      .catch(() => addToast('Error al cargar el pedido', 'error'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDownloadPDF = () => {
    window.open(ordersAPI.getPDFUrl(parseInt(id!)), '_blank');
  };

  const handleShare = async () => {
    if (!order) return;
    const client = order.cliente?.nombre ?? order.clienteNombre ?? 'Sin cliente';
    const text = buildShareText(order, client);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Pedido #${order.id}`, text });
      } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      addToast('Texto copiado al portapapeles', 'success');
    }
  };

  const handleCopyDetails = async () => {
    if (!order) return;
    const client = order.cliente?.nombre ?? order.clienteNombre ?? 'Sin cliente';
    const text = buildShareText(order, client);

    try {
      await navigator.clipboard.writeText(text);
      addToast('Detalle del pedido copiado', 'success');
    } catch {
      addToast('No se pudo copiar al portapapeles', 'error');
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!order) return (
    <div className="text-center py-16">
      <p className="text-gray-400 text-lg">Pedido no encontrado</p>
      <Link to="/history" className="text-brand-600 text-sm mt-3 block">← Volver al historial</Link>
    </div>
  );

  const clientName = order.cliente?.nombre ?? order.clienteNombre ?? 'Sin cliente';
  const fcaItems = order.items.filter((i) => i.tipoLinea === 'FC_A');
  const remitoItems = order.items.filter((i) => i.tipoLinea !== 'FC_A');
  const percepcionIva = order.percepcionIva ?? 0;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="space-y-4">

        {/* Header card */}
        <div className="card bg-brand-800 text-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/60 text-xs">Pedido #{order.id}</p>
              <p className="text-xl font-bold mt-0.5">{clientName}</p>
              {order.cliente?.codigo && (
                <p className="text-white/70 text-xs">Cód: {order.cliente.codigo}</p>
              )}
            </div>
            <span className={`badge text-sm px-3 py-1.5 ${
              order.estado === 'confirmado' ? 'bg-green-500 text-white' : 'bg-yellow-400 text-yellow-900'
            }`}>
              {order.estado}
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs">Tipo</p>
              <p className="text-sm font-medium">{MODE_LABELS[order.tipoCalculo]}</p>
            </div>
            <div className="text-right">
              <p className="text-white/60 text-xs">Fecha</p>
              <p className="text-sm font-medium">{formatDate(order.fecha)}</p>
            </div>
          </div>
          {order.priceList && (
            <p className="text-white/50 text-xs mt-2">Lista: {order.priceList.nombre}</p>
          )}
        </div>

        {/* MITAD groups */}
        {order.tipoCalculo === 'MITAD' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="card bg-blue-50 border-blue-200 border">
              <p className="text-xs font-semibold text-blue-700">FC A ({fcaItems.length} items)</p>
              <p className="font-bold text-blue-800 mt-0.5">
                {formatCurrency(fcaItems.reduce((a, i) => a + i.total, 0))}
              </p>
            </div>
            <div className="card bg-gray-50">
              <p className="text-xs font-semibold text-gray-700">Remito ({remitoItems.length} items)</p>
              <p className="font-bold text-gray-800 mt-0.5">
                {formatCurrency(remitoItems.reduce((a, i) => a + i.total, 0))}
              </p>
            </div>
          </div>
        )}

        {/* Items */}
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-semibold text-gray-800 text-sm">{order.items.length} productos</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Cód</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Descripción</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Cant</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Precio</th>
                  {order.tipoCalculo === 'FC_A' || order.tipoCalculo === 'MITAD' ? (
                    <>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Neto</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">IVA</th>
                    </>
                  ) : null}
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {order.items.map((item, idx) => (
                  <tr
                    key={idx}
                    className={item.tipoLinea === 'FC_A' ? 'bg-blue-50/40' : ''}
                  >
                    <td className="px-3 py-2.5 font-mono font-medium text-brand-700">{item.codigo}</td>
                    <td className="px-3 py-2.5 text-gray-700 max-w-[120px]">
                      <p className="truncate">{item.descripcion}</p>
                      {order.tipoCalculo === 'MITAD' && (
                        <span className={`badge text-[10px] ${item.tipoLinea === 'FC_A' ? 'badge-blue' : 'badge-gray'}`}>
                          {item.tipoLinea}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">{item.cantidad}</td>
                    <td className="px-3 py-2.5 text-right">{formatCurrency(item.precioAplicado)}</td>
                    {(order.tipoCalculo === 'FC_A' || order.tipoCalculo === 'MITAD') && (
                      <>
                        <td className="px-3 py-2.5 text-right text-gray-600">
                          {item.neto != null ? formatCurrency(item.neto) : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-600">
                          {item.iva != null ? formatCurrency(item.iva) : '-'}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                      {formatCurrency(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals */}
        <div className="card space-y-2">
          {order.subtotalNeto > 0 && (
            <>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal neto</span>
                <span>{formatCurrency(order.subtotalNeto)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>IVA (21%)</span>
                <span>{formatCurrency(order.ivaTotal)}</span>
              </div>
              {percepcionIva > 0 && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>IVA estimado (3%)</span>
                  <span>{formatCurrency(percepcionIva)}</span>
                </div>
              )}
              <div className="border-t border-gray-100 pt-2" />
            </>
          )}
          <div className="flex justify-between text-xl font-bold text-gray-900">
            <span>TOTAL</span>
            <span className="text-brand-700">{formatCurrency(order.totalFinal)}</span>
          </div>
        </div>

        {/* Observations */}
        {order.observaciones && (
          <div className="card bg-yellow-50 border-yellow-200 border">
            <p className="text-xs font-semibold text-yellow-800">Observaciones</p>
            <p className="text-sm text-yellow-700 mt-1">{order.observaciones}</p>
          </div>
        )}

        {/* Original text */}
        {order.textoOriginal && (
          <div className="card bg-gray-50">
            <p className="text-xs font-semibold text-gray-600 mb-1">Texto original</p>
            <p className="text-xs font-mono text-gray-500 break-all">{order.textoOriginal}</p>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button onClick={handleDownloadPDF} className="btn-secondary flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Descargar PDF
          </button>
          <button onClick={handleCopyDetails} className="btn-secondary flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16h8M8 12h8m-8-4h5m3-5H8a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V8l-4-4z" />
            </svg>
            Copiar detalle
          </button>
          <button onClick={handleShare} className="btn-secondary flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Compartir
          </button>
        </div>

        <Link to="/new-order" className="btn-primary w-full flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo pedido
        </Link>
      </div>
    </>
  );
}

function buildShareText(order: Order, clientName: string): string {
  const totalFCA = round2(
    order.items
      .filter((item) => item.tipoLinea === 'FC_A')
      .reduce((acc, item) => acc + item.total, 0),
  );
  const totalRemito = round2(
    order.items
      .filter((item) => item.tipoLinea !== 'FC_A')
      .reduce((acc, item) => acc + item.total, 0),
  );
  const percepcionIva = order.percepcionIva ?? 0;
  const totalFCAConPercepciones = round2(totalFCA + percepcionIva);

  const lines: string[] = [
    `Cliente: ${clientName}`,
    `Fecha: ${new Date(order.fecha).toLocaleDateString('es-AR')}`,
    '',
  ];
/*
  for (const item of order.items) {
    const lineType = order.tipoCalculo === 'MITAD' ? ` [${item.tipoLinea}]` : '';
    const shortDesc = shortenDescription(item.descripcion);
    lines.push(
      `• ${item.codigo}${lineType} — ${shortDesc}: x${item.cantidad} * ${formatCurrency(item.precioAplicado)} = ${formatCurrency(item.total)}`,
    );
  }
*/

  if (percepcionIva > 0) {
    lines.push(`Total FC A (aprox. con percepciones): ${formatCurrency(totalFCAConPercepciones)}`);
  } else {
    lines.push(`Total FC A: ${formatCurrency(totalFCA)}`);
  }
  lines.push(`Total Remito: ${formatCurrency(totalRemito)}`);

  return lines.join('\n');
}

function shortenDescription(text: string, maxLen = 28): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLen - 3))}...`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}



