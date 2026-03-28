import { Outlet, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import BottomNav from './BottomNav';

const titles: Record<string, string> = {
  '/':            'Inicio',
  '/clients':     'Clientes',
  '/price-list':  'Lista de Precios',
  '/new-order':   'Nuevo Pedido',
  '/history':     'Historial',
  '/settings':    'Configuración',
};

export default function Layout() {
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const isOrderResult = location.pathname.startsWith('/order/');
  const title = isOrderResult
    ? 'Detalle del Pedido'
    : titles[location.pathname] ?? 'Chil Slices';

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-brand-800 text-white safe-top">
        <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            {/* Back button for sub-pages */}
            {isOrderResult && (
              <Link to="/history" className="text-white/80 hover:text-white mr-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
            )}
            <span className="font-semibold text-lg tracking-tight">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/settings" className="text-white/80 hover:text-white p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
            <button onClick={logout} className="text-white/80 hover:text-white p-1" title="Salir">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
        {user && (
          <div className="px-4 pb-1 text-xs text-white/60 max-w-lg mx-auto">
            {user.name} · {user.role === 'admin' ? 'Administrador' : 'Vendedor'}
          </div>
        )}
      </header>

      {/* Page content */}
      <main className="flex-1 pb-20 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-4">
          <Outlet />
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
