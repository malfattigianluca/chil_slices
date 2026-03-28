import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersAPI, mailAPI } from '../services/api';
import { OrderSummary, CalcMode } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import ToastContainer from '../components/Toast';
import { useToast } from '../hooks/useToast';

const MODE_LABELS: Record<CalcMode, string> = {
  FC_A: 'FC A', MITAD: 'Mitad', Z: 'Z', REMITO: 'Remito',
};

const MODE_BADGE: Record<CalcMode, string> = {
  FC_A: 'badge-blue', MITAD: 'badge-yellow', Z: 'badge-gray', REMITO: 'badge-gray',
};

const ENVIO_BADGE: Record<string, string> = {
  pendiente: 'badge-gray',
  enviado: 'badge-green',
  error: 'badge-red',
};

function formatCurrency(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface Filters {
  estado: string;
  tipoCalculo: string;
  estadoEnvio: string;
  fechaDesde: string;
  fechaHasta: string;
}

const EMPTY_FILTERS: Filters = { estado: '', tipoCalculo: '', estadoEnvio: '', fechaDesde: '', fechaHasta: '' };

export default function History() {
  const { toasts, addToast, removeToast } = useToast();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const LIMIT = 20;

  // Batch mail send state
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchEmail, setBatchEmail] = useState('');
  const [batchSending, setBatchSending] = useState(false);

  const load = async (p = 0, f: Filters = filters) => {
    setLoading(true);
    try {
      const res = await ordersAPI.getAll({
        limit: LIMIT,
        offset: p * LIMIT,
        estado: f.estado || undefined,
        tipoCalculo: f.tipoCalculo || undefined,
        estadoEnvio: f.estadoEnvio || undefined,
        fechaDesde: f.fechaDesde || undefined,
        fechaHasta: f.fechaHasta || undefined,
      });
      setOrders(res.orders);
      setTotal(res.total);
    } catch {
      addToast('Error al cargar historial', 'error');
    }
    setLoading(false);
  };

  useEffect(() => { load(0, EMPTY_FILTERS); }, []);

  const applyFilters = (f: Filters) => {
    setFilters(f);
    setPage(0);
    load(0, f);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPage(0);
    load(0, EMPTY_FILTERS);
  };

  const hasActiveFilters = Object.values(filters).some(Boolean);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm('¿Eliminar este pedido?')) return;
    try {
      await ordersAPI.delete(id);
      addToast('Pedido eliminado', 'success');
      load(page, filters);
    } catch { addToast('Error al eliminar', 'error'); }
  };

  const handleBatchSend = async () => {
    if (!batchEmail.trim()) return;
    setBatchSending(true);
    try {
      const res = await mailAPI.sendBatch(batchEmail.trim());
      if (res.ok) {
        const msg = res.enviados === 0
          ? 'No hay pedidos pendientes de envío hoy'
          : `${res.enviados} pedido${res.enviados !== 1 ? 's' : ''} enviado${res.enviados !== 1 ? 's' : ''}`;
        addToast(msg, res.enviados === 0 ? 'warning' : 'success');
        setShowBatchModal(false);
        setBatchEmail('');
        load(page, filters);
      } else {
        addToast(res.error || 'Error al enviar', 'error');
      }
    } catch (e: any) {
      addToast(e.response?.data?.error || 'Error al enviar', 'error');
    }
    setBatchSending(false);
  };

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Batch send modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-xl">
            <h3 className="font-semibold text-gray-800">Enviar pedidos del día</h3>
            <p className="text-sm text-gray-500">
              Se enviarán todos los pedidos confirmados de hoy que aún no fueron enviados.
            </p>
            <input
              type="email"
              value={batchEmail}
              onChange={(e) => setBatchEmail(e.target.value)}
              placeholder="destinatario@email.com"
              className="input-field text-sm py-2 w-full"
              onKeyDown={(e) => e.key === 'Enter' && handleBatchSend()}
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowBatchModal(false); setBatchEmail(''); }}
                className="btn-secondary flex-1 py-2 text-sm"
                disabled={batchSending}
              >
                Cancelar
              </button>
              <button
                onClick={handleBatchSend}
                disabled={batchSending || !batchEmail.trim()}
                className="btn-primary flex-1 py-2 text-sm"
              >
                {batchSending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">{total} pedidos</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowBatchModal(true)}
              className="btn-secondary py-2 px-3 text-sm"
            >
              Enviar día
            </button>
            <Link to="/new-order" className="btn-primary py-2 px-4 text-sm">+ Nuevo</Link>
          </div>
        </div>

        {/* Filter toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex-1 flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
              hasActiveFilters
                ? 'bg-brand-50 border-brand-200 text-brand-700'
                : 'bg-white border-gray-200 text-gray-600'
            }`}
          >
            <span>Filtros{hasActiveFilters ? ' (activos)' : ''}</span>
            <span className="text-gray-400">{showFilters ? '▲' : '▼'}</span>
          </button>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-gray-600 px-2">
              Limpiar
            </button>
          )}
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="card space-y-3 border border-gray-200">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
                <select
                  value={filters.estado}
                  onChange={(e) => applyFilters({ ...filters, estado: e.target.value })}
                  className="input-field text-sm py-2 w-full"
                >
                  <option value="">Todos</option>
                  <option value="borrador">Borrador</option>
                  <option value="confirmado">Confirmado</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Modo</label>
                <select
                  value={filters.tipoCalculo}
                  onChange={(e) => applyFilters({ ...filters, tipoCalculo: e.target.value })}
                  className="input-field text-sm py-2 w-full"
                >
                  <option value="">Todos</option>
                  <option value="FC_A">Factura A</option>
                  <option value="MITAD">Mitad</option>
                  <option value="Z">Lista Z</option>
                  <option value="REMITO">Remito</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Envío</label>
                <select
                  value={filters.estadoEnvio}
                  onChange={(e) => applyFilters({ ...filters, estadoEnvio: e.target.value })}
                  className="input-field text-sm py-2 w-full"
                >
                  <option value="">Todos</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="enviado">Enviado</option>
                  <option value="error">Error</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
                <input
                  type="date"
                  value={filters.fechaDesde}
                  onChange={(e) => applyFilters({ ...filters, fechaDesde: e.target.value })}
                  className="input-field text-sm py-2 w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
                <input
                  type="date"
                  value={filters.fechaHasta}
                  onChange={(e) => applyFilters({ ...filters, fechaHasta: e.target.value })}
                  className="input-field text-sm py-2 w-full"
                />
              </div>
            </div>
          </div>
        )}

        {/* List */}
        {loading && !orders.length ? (
          <LoadingSpinner />
        ) : orders.length === 0 ? (
          <div className="card text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-medium">Sin pedidos</p>
            <p className="text-sm mt-1">{hasActiveFilters ? 'Probá otros filtros' : 'Creá tu primer pedido'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <Link
                key={order.id}
                to={`/order/${order.id}`}
                className="card flex items-center gap-3 active:bg-gray-50 transition-colors"
              >
                {/* Left: client avatar */}
                <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-brand-700 font-bold flex-shrink-0">
                  {(order.cliente?.nombre ?? order.clienteNombre ?? '?').charAt(0).toUpperCase()}
                </div>

                {/* Center: info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">
                    {order.cliente?.nombre ?? order.clienteNombre ?? 'Sin cliente'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`badge text-[10px] ${MODE_BADGE[order.tipoCalculo]}`}>
                      {MODE_LABELS[order.tipoCalculo]}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(order.fecha)}</span>
                    <span className="text-xs text-gray-400">{order._count.items} items</span>
                    {order.estadoEnvio && order.estadoEnvio !== 'pendiente' && (
                      <span className={`badge text-[10px] ${ENVIO_BADGE[order.estadoEnvio] ?? 'badge-gray'}`}>
                        {order.estadoEnvio}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: total + delete */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <p className="font-bold text-gray-800 text-sm">{formatCurrency(order.totalFinal)}</p>
                    <span className={`badge text-[10px] ${order.estado === 'confirmado' ? 'badge-green' : 'badge-yellow'}`}>
                      {order.estado}
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDelete(order.id, e)}
                    className="p-1.5 text-gray-300 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > LIMIT && (
          <div className="flex items-center justify-between">
            <button
              disabled={page === 0}
              onClick={() => { const p = page - 1; setPage(p); load(p, filters); }}
              className="btn-secondary py-2 px-4 text-sm disabled:opacity-40"
            >
              ← Anterior
            </button>
            <span className="text-sm text-gray-500">
              Pág {page + 1} / {Math.ceil(total / LIMIT)}
            </span>
            <button
              disabled={(page + 1) * LIMIT >= total}
              onClick={() => { const p = page + 1; setPage(p); load(p, filters); }}
              className="btn-secondary py-2 px-4 text-sm disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
