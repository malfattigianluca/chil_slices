import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/authStore';
import { authAPI } from '../services/api';
import { InlineSpinner } from '../components/LoadingSpinner';

interface PwdForm { oldPassword: string; newPassword: string; confirm: string; }

export default function Settings() {
  const { user, logout } = useAuthStore();
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const { register, handleSubmit, reset, formState: { isSubmitting, errors } } = useForm<PwdForm>();

  const onSubmit = async (data: PwdForm) => {
    if (data.newPassword !== data.confirm) { setError('Las contraseñas no coinciden'); return; }
    setError(''); setSuccess('');
    try {
      await authAPI.changePassword(data.oldPassword, data.newPassword);
      setSuccess('Contraseña actualizada correctamente');
      reset();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Error al cambiar contraseña');
    }
  };

  return (
    <div className="space-y-5">
      {/* Profile card */}
      <div className="card">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center text-brand-700 font-bold text-xl">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-800">{user?.name}</p>
            <p className="text-sm text-gray-500">@{user?.username}</p>
            <span className="badge-blue mt-1">{user?.role === 'admin' ? 'Administrador' : 'Vendedor'}</span>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4">Cambiar contraseña</h3>

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm mb-4">
            {success}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña actual</label>
            <input
              {...register('oldPassword', { required: true })}
              type="password"
              className="input-field"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nueva contraseña</label>
            <input
              {...register('newPassword', { required: true, minLength: 6 })}
              type="password"
              className="input-field"
              placeholder="Mínimo 6 caracteres"
            />
            {errors.newPassword?.type === 'minLength' && (
              <p className="text-xs text-red-500 mt-1">Mínimo 6 caracteres</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirmar nueva contraseña</label>
            <input
              {...register('confirm', { required: true })}
              type="password"
              className="input-field"
              placeholder="Repetir contraseña"
            />
          </div>
          <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
            {isSubmitting ? <InlineSpinner /> : 'Actualizar contraseña'}
          </button>
        </form>
      </div>

      {/* Info */}
      <div className="card text-sm text-gray-500 space-y-1">
        <p className="font-medium text-gray-700">Chil Slices — Pedidos Mayoristas</p>
        <p>Versión 1.0.0</p>
        <p>IVA por defecto: 21%</p>
      </div>

      {/* Logout */}
      <button onClick={logout} className="btn-danger w-full">
        Cerrar sesión
      </button>
    </div>
  );
}
