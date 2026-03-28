import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersAPI, priceListsAPI } from '../services/api';
import { Metrics, PriceList } from '../types';
import { useAuthStore } from '../store/authStore';
import LoadingSpinner from '../components/LoadingSpinner';

function formatCurrency(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [activeList, setActiveList] = useState<PriceList | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      ordersAPI.metrics().catch(() => null),
      priceListsAPI.getActive().catch(() => null),
    ]).then(([m, pl]) => {
      setMetrics(m);
      setActiveList(pl);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <h2 className="text-xl font-bold text-gray-800">{greeting}, {user?.name?.split(' ')[0]} 👋</h2>
        <p className="text-sm text-gray-500 mt-0.5">Acá están tus métricas de hoy</p>
      </div>

      {/* Metrics grid */}
      {metrics && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card">
            <p className="text-xs text-gray-500 font-medium">Pedidos hoy</p>
            <p className="text-3xl font-bold text-brand-700 mt-1">{metrics.today}</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-500 font-medium">Confirmados</p>
            <p className="text-3xl font-bold text-green-600 mt-1">{metrics.confirmed}</p>
          </div>
          <div className="card col-span-2">
            <p className="text-xs text-gray-500 font-medium">Total vendido</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{formatCurrency(metrics.totalVentas)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{metrics.total} pedidos en total</p>
          </div>
        </div>
      )}

      {/* Active price list */}
      <div className="card flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium">Lista de precios vigente</p>
          {activeList ? (
            <>
              <p className="font-semibold text-gray-800 mt-0.5">{activeList.nombre}</p>
              {activeList.version && <p className="text-xs text-gray-400">v{activeList.version}</p>}
            </>
          ) : (
            <p className="text-sm text-red-500 font-medium mt-0.5">Sin lista activa</p>
          )}
        </div>
        <Link to="/price-list" className="text-brand-600 text-sm font-medium">
          Gestionar →
        </Link>
      </div>

      {/* Quick actions */}
      <div>
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Acciones rápidas</h3>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/new-order" className="card flex flex-col items-center gap-2 py-5 hover:border-brand-300 transition-colors border-2 border-transparent active:bg-gray-50">
            <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-brand-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">Nuevo pedido</span>
          </Link>
          <Link to="/history" className="card flex flex-col items-center gap-2 py-5 hover:border-brand-300 transition-colors border-2 border-transparent active:bg-gray-50">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">Ver historial</span>
          </Link>
          <Link to="/clients" className="card flex flex-col items-center gap-2 py-5 hover:border-brand-300 transition-colors border-2 border-transparent active:bg-gray-50">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">Clientes</span>
          </Link>
          <Link to="/price-list" className="card flex flex-col items-center gap-2 py-5 hover:border-brand-300 transition-colors border-2 border-transparent active:bg-gray-50">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-orange-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-700">Precios</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
