import { useEffect, useRef, useState } from 'react';
import { clientsAPI } from '../services/api';
import { Client } from '../types';
import LoadingSpinner, { InlineSpinner } from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import ToastContainer from '../components/Toast';
import { useToast } from '../hooks/useToast';

const COMPROBANTES = ['FC_A', 'REMITO', 'Z', 'MITAD'] as const;
const FISCAL = ['Responsable Inscripto', 'Monotributo', 'Exento', 'Consumidor Final'];

const emptyForm = {
  codigo: '',
  cuit: '',
  nombre: '',
  condicionFiscal: '',
  tipoComprobanteHabitual: 'Z' as Client['tipoComprobanteHabitual'],
  direccion: '',
  telefono: '',
  zona: '',
  observaciones: '',
};

export default function Clients() {
  const { toasts, addToast, removeToast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);

  const load = async (q?: string) => {
    setLoading(true);
    const data = await clientsAPI.getAll(q).catch(() => []);
    setClients(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setModalOpen(true); };
  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({
      codigo: c.codigo,
      cuit: c.cuit ?? '',
      nombre: c.nombre,
      condicionFiscal: c.condicionFiscal ?? '',
      tipoComprobanteHabitual: c.tipoComprobanteHabitual,
      direccion: c.direccion ?? '', telefono: c.telefono ?? '',
      zona: c.zona ?? '', observaciones: c.observaciones ?? '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.codigo || !form.nombre) { addToast('Código y nombre son requeridos', 'warning'); return; }

    const payload = {
      codigo: form.codigo,
      cuit: form.cuit || undefined,
      nombre: form.nombre,
      condicionFiscal: form.condicionFiscal || undefined,
      tipoComprobanteHabitual: form.tipoComprobanteHabitual,
      direccion: form.direccion || undefined,
      telefono: form.telefono || undefined,
      zona: form.zona || undefined,
      observaciones: form.observaciones || undefined,
    };

    setSaving(true);
    try {
      if (editing) {
        await clientsAPI.update(editing.id, payload);
        addToast('Cliente actualizado', 'success');
      } else {
        await clientsAPI.create(payload);
        addToast('Cliente creado', 'success');
      }
      setModalOpen(false);
      load(search || undefined);
    } catch (e: any) {
      addToast(e.response?.data?.error || 'Error al guardar', 'error');
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este cliente?')) return;
    try {
      await clientsAPI.delete(id);
      addToast('Cliente eliminado', 'success');
      load(search || undefined);
    } catch { addToast('Error al eliminar', 'error'); }
  };

  const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await clientsAPI.importCSV(file);
      addToast(`${res.imported} clientes importados`, 'success');
      if (res.errors.length) addToast(`${res.errors.length} errores`, 'warning');
      load();
    } catch { addToast('Error al importar CSV', 'error'); }
    e.target.value = '';
  };

  const handleSearch = (v: string) => {
    setSearch(v);
    load(v || undefined);
  };

  const comprobanteLabel: Record<string, string> = {
    FC_A: 'FC A', REMITO: 'Remito', Z: 'Lista Z', MITAD: 'Mitad',
  };

  if (loading && !clients.length) return <LoadingSpinner />;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">{clients.length} clientes</h2>
          <div className="flex gap-2">
            <button onClick={() => csvRef.current?.click()} className="btn-secondary py-2 px-3 text-sm">
              CSV
            </button>
            <button onClick={openCreate} className="btn-primary py-2 px-4 text-sm">
              + Nuevo
            </button>
          </div>
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="input-field"
          placeholder="Buscar por nombre, código o zona..."
        />

        {/* Client list */}
        {loading ? (
          <LoadingSpinner text="Buscando..." />
        ) : clients.length === 0 ? (
          <div className="card text-center py-10 text-gray-400">
            <p className="text-4xl mb-3">👥</p>
            <p className="font-medium">No hay clientes cargados</p>
            <p className="text-sm mt-1">Creá uno o importá desde CSV</p>
          </div>
        ) : (
          <div className="space-y-2">
            {clients.map((c) => (
              <div key={c.id} className="card flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center text-brand-700 font-bold flex-shrink-0">
                  {c.nombre.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{c.nombre}</p>
                  <p className="text-xs text-gray-500">
                    Cód: <span className="font-mono">{c.codigo}</span>
                    {c.cuit ? ` · CUIT ${c.cuit}` : ''}
                    {c.zona ? ` · ${c.zona}` : ''}
                  </p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    <span className="badge-blue">{comprobanteLabel[c.tipoComprobanteHabitual] ?? c.tipoComprobanteHabitual}</span>
                    {c.condicionFiscal && <span className="badge-gray">{c.condicionFiscal}</span>}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(c)} className="p-2 text-gray-400 hover:text-brand-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="p-2 text-gray-400 hover:text-red-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create / Edit modal ── */}
      <Modal
        open={modalOpen}
        title={editing ? `Editar: ${editing.nombre}` : 'Nuevo cliente'}
        onClose={() => setModalOpen(false)}
        footer={
          <div className="flex gap-3">
            <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? <InlineSpinner /> : 'Guardar'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Código *</label>
              <input value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} className="input-field" placeholder="Ej: C001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Comprobante</label>
              <select value={form.tipoComprobanteHabitual} onChange={(e) => setForm((f) => ({ ...f, tipoComprobanteHabitual: e.target.value as any }))} className="input-field">
                {COMPROBANTES.map((c) => <option key={c} value={c}>{comprobanteLabel[c]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">CUIT</label>
            <input value={form.cuit} onChange={(e) => setForm((f) => ({ ...f, cuit: e.target.value }))} className="input-field" placeholder="Ej: 30712345678" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre / Razón social *</label>
            <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="input-field" placeholder="Nombre completo" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Condición fiscal</label>
            <select value={form.condicionFiscal} onChange={(e) => setForm((f) => ({ ...f, condicionFiscal: e.target.value }))} className="input-field">
              <option value="">Seleccionar...</option>
              {FISCAL.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Teléfono</label>
              <input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} className="input-field" placeholder="+54 9 11..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Zona</label>
              <input value={form.zona} onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))} className="input-field" placeholder="Ej: Norte" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Dirección</label>
            <input value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} className="input-field" placeholder="Calle y número" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Observaciones</label>
            <textarea value={form.observaciones} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} className="input-field resize-none" rows={2} placeholder="Notas adicionales..." />
          </div>
        </div>
      </Modal>
    </>
  );
}

const comprobanteLabel: Record<string, string> = {
  FC_A: 'FC A', REMITO: 'Remito', Z: 'Lista Z', MITAD: 'Mitad',
};
