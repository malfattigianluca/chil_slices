import { useEffect, useRef, useState } from 'react';
import { priceListsAPI } from '../services/api';
import { PriceList as PriceListType, Product } from '../types';
import LoadingSpinner, { InlineSpinner } from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import ToastContainer from '../components/Toast';
import { useToast } from '../hooks/useToast';

function formatCurrency(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
}

export default function PriceList() {
  const { toasts, addToast, removeToast } = useToast();
  const [lists, setLists] = useState<PriceListType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedList, setSelectedList] = useState<PriceListType | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');

  // Upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewProducts, setPreviewProducts] = useState<Product[] | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMeta, setUploadMeta] = useState({ nombre: '', version: '', vigente: false, ivaPorcentaje: 21 });
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // Edit product state
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editData, setEditData] = useState({ precioUnidad: 0, precioBulto: '', descripcion: '' });

  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const data = await priceListsAPI.getAll().catch(() => []);
    setLists(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openList = async (list: PriceListType) => {
    setSelectedList(list);
    const full = await priceListsAPI.getById(list.id).catch(() => null);
    setProducts(full?.products ?? []);
  };

  const handleActivate = async (id: number) => {
    try {
      await priceListsAPI.activate(id);
      addToast('Lista activada correctamente', 'success');
      load();
    } catch { addToast('Error al activar lista', 'error'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta lista? Esta acción no se puede deshacer.')) return;
    try {
      await priceListsAPI.delete(id);
      addToast('Lista eliminada', 'success');
      setSelectedList(null);
      load();
    } catch (e: any) {
      addToast(e.response?.data?.error || 'Error al eliminar', 'error');
    }
  };

  const handlePreview = async () => {
    if (!uploadFile) return;
    setPreviewing(true);
    try {
      const res = await priceListsAPI.previewPDF(uploadFile);
      setPreviewProducts(res.products);
      addToast(`${res.count} productos detectados`, 'info');
    } catch { addToast('Error al leer el PDF', 'error'); }
    setPreviewing(false);
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadMeta.nombre) {
      addToast('Ingresá el nombre de la lista', 'warning');
      return;
    }
    setUploading(true);
    try {
      await priceListsAPI.uploadPDF(uploadFile, uploadMeta);
      addToast('Lista cargada correctamente', 'success');
      setUploadOpen(false);
      setPreviewProducts(null);
      setUploadFile(null);
      setUploadMeta({ nombre: '', version: '', vigente: false, ivaPorcentaje: 21 });
      load();
    } catch (e: any) {
      addToast(e.response?.data?.error || 'Error al cargar', 'error');
    }
    setUploading(false);
  };

  const handleSaveProduct = async () => {
    if (!editProduct) return;
    try {
      await priceListsAPI.updateProduct(editProduct.id, {
        descripcion: editData.descripcion,
        precioUnidad: editData.precioUnidad,
        precioBulto: editData.precioBulto ? parseFloat(editData.precioBulto) : null,
      });
      addToast('Producto actualizado', 'success');
      // Refresh products
      if (selectedList) openList(selectedList);
      setEditProduct(null);
    } catch { addToast('Error al actualizar', 'error'); }
  };

  const filteredProducts = products.filter(
    (p) =>
      !search ||
      p.codigo.includes(search) ||
      p.descripcion.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">Listas cargadas</h2>
          <button onClick={() => setUploadOpen(true)} className="btn-primary py-2 px-4 text-sm">
            + Cargar PDF
          </button>
        </div>

        {/* List of price lists */}
        {lists.length === 0 ? (
          <div className="card text-center py-10 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-medium">No hay listas cargadas</p>
            <p className="text-sm mt-1">Subí un PDF con la lista de precios</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lists.map((list) => (
              <div key={list.id} className={`card border-2 ${list.vigente ? 'border-green-400' : 'border-transparent'}`}>
                <div className="flex items-start justify-between">
                  <button onClick={() => openList(list)} className="text-left flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-800">{list.nombre}</span>
                      {list.vigente && <span className="badge-green">Vigente</span>}
                    </div>
                    {list.version && <p className="text-xs text-gray-500">v{list.version}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(list.fechaCarga).toLocaleDateString('es-AR')} ·{' '}
                      {(list._count?.products ?? 0)} productos
                    </p>
                  </button>
                  <div className="flex gap-2 ml-2">
                    {!list.vigente && (
                      <button
                        onClick={() => handleActivate(list.id)}
                        className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1.5 rounded-lg font-medium"
                      >
                        Activar
                      </button>
                    )}
                    {!list.vigente && (
                      <button
                        onClick={() => handleDelete(list.id)}
                        className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-1.5 rounded-lg font-medium"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Product viewer modal ── */}
      <Modal
        open={!!selectedList}
        title={selectedList?.nombre ?? ''}
        onClose={() => { setSelectedList(null); setProducts([]); setSearch(''); }}
      >
        <div className="space-y-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field"
            placeholder="Buscar código o descripción..."
          />
          <p className="text-xs text-gray-400">{filteredProducts.length} productos</p>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredProducts.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    <span className="text-brand-700 font-mono">{p.codigo}</span> — {p.descripcion}
                  </p>
                  <p className="text-xs text-gray-500">
                    Unit: {formatCurrency(p.precioUnidad)}
                    {p.precioBulto ? ` · Bulto: ${formatCurrency(p.precioBulto)}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditProduct(p);
                    setEditData({ precioUnidad: p.precioUnidad, precioBulto: p.precioBulto?.toString() ?? '', descripcion: p.descripcion });
                  }}
                  className="text-xs text-brand-600 ml-3 flex-shrink-0"
                >
                  Editar
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* ── Edit product modal ── */}
      <Modal
        open={!!editProduct}
        title={`Editar producto ${editProduct?.codigo}`}
        onClose={() => setEditProduct(null)}
        footer={
          <div className="flex gap-3">
            <button onClick={() => setEditProduct(null)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={handleSaveProduct} className="btn-primary flex-1">Guardar</button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Descripción</label>
            <input
              value={editData.descripcion}
              onChange={(e) => setEditData((d) => ({ ...d, descripcion: e.target.value }))}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Precio unitario (c/IVA)</label>
            <input
              type="number"
              step="0.01"
              value={editData.precioUnidad}
              onChange={(e) => setEditData((d) => ({ ...d, precioUnidad: parseFloat(e.target.value) }))}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Precio bulto (c/IVA)</label>
            <input
              type="number"
              step="0.01"
              value={editData.precioBulto}
              onChange={(e) => setEditData((d) => ({ ...d, precioBulto: e.target.value }))}
              className="input-field"
              placeholder="Dejar vacío si no aplica"
            />
          </div>
        </div>
      </Modal>

      {/* ── Upload PDF modal ── */}
      <Modal
        open={uploadOpen}
        title="Cargar lista de precios"
        onClose={() => { setUploadOpen(false); setPreviewProducts(null); setUploadFile(null); }}
        footer={
          <div className="flex gap-3">
            <button onClick={() => { setUploadOpen(false); setPreviewProducts(null); setUploadFile(null); }} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button onClick={handleUpload} disabled={uploading || !uploadFile} className="btn-primary flex-1">
              {uploading ? <InlineSpinner /> : 'Guardar lista'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* File picker */}
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-brand-400 transition-colors"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setUploadFile(f); setPreviewProducts(null); }
              }}
            />
            <p className="text-3xl mb-2">📄</p>
            <p className="font-medium text-gray-700">{uploadFile ? uploadFile.name : 'Seleccioná el PDF'}</p>
            <p className="text-xs text-gray-400 mt-1">Máx. 20 MB</p>
          </div>

          {uploadFile && (
            <button onClick={handlePreview} disabled={previewing} className="btn-secondary w-full">
              {previewing ? <InlineSpinner /> : '🔍 Vista previa de productos'}
            </button>
          )}

          {previewProducts && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <p className="text-sm font-medium text-gray-700">
                ✅ {previewProducts.length} productos detectados
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {previewProducts.slice(0, 10).map((p, i) => (
                  <p key={i} className="text-xs text-gray-600">
                    <span className="font-mono text-brand-700">{p.codigo}</span> — {p.descripcion} — {formatCurrency(p.precioUnidad)}
                    {p.precioBulto && ` / ${formatCurrency(p.precioBulto)}`}
                  </p>
                ))}
                {previewProducts.length > 10 && (
                  <p className="text-xs text-gray-400">... y {previewProducts.length - 10} más</p>
                )}
              </div>
            </div>
          )}

          {uploadFile && !previewProducts && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-700">
              <p className="font-semibold mb-1">💡 Hint si no detecta productos:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>El PDF debe tener líneas que comiencen con código (números: 101, 2050, etc)</li>
                <li>Luego el nombre del producto</li>
                <li>Al final, precios (precio unitario y/o bulto)</li>
                <li>Ej: <code>339 Chocolate Amargo 25 250</code></li>
              </ul>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre de la lista *</label>
            <input
              value={uploadMeta.nombre}
              onChange={(e) => setUploadMeta((m) => ({ ...m, nombre: e.target.value }))}
              className="input-field"
              placeholder="Ej: Lista Marzo 2025"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Versión</label>
            <input
              value={uploadMeta.version}
              onChange={(e) => setUploadMeta((m) => ({ ...m, version: e.target.value }))}
              className="input-field"
              placeholder="Ej: 1.0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">IVA % (default 21)</label>
            <input
              type="number"
              value={uploadMeta.ivaPorcentaje}
              onChange={(e) => setUploadMeta((m) => ({ ...m, ivaPorcentaje: parseFloat(e.target.value) }))}
              className="input-field"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={uploadMeta.vigente}
              onChange={(e) => setUploadMeta((m) => ({ ...m, vigente: e.target.checked }))}
              className="w-5 h-5 accent-brand-700"
            />
            <span className="text-sm font-medium text-gray-700">Activar como lista vigente</span>
          </label>
        </div>
      </Modal>
    </>
  );
}
