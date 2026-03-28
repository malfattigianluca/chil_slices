import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ordersAPI, clientsAPI, priceListsAPI } from '../services/api';
import { useOrderStore } from '../store/orderStore';
import { PriceList, PreviewResult, CalcMode, CalculationResult, OrderItem, FuzzyClientMatch } from '../types';
import LoadingSpinner, { InlineSpinner } from '../components/LoadingSpinner';
import ToastContainer from '../components/Toast';
import { useToast } from '../hooks/useToast';

const MODE_LABELS: Record<CalcMode, string> = {
  FC_A: 'Factura A',
  MITAD: 'Mitad FC-A / Remito',
  Z: 'Lista Z',
  REMITO: 'Remito',
};

const EXAMPLE_ORDER =
  'Rojo - 339: mitad - 506=10 - 524=1 - 655=1 - 611=3 - 612=3 - 609=4 - 534=10 - 601=20 - 675=2';

function formatCurrency(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
}

export default function NewOrder() {
  const navigate = useNavigate();
  const { toasts, addToast, removeToast } = useToast();
  const { draft, setDraftText, setDraftClientId, setPreview, clearDraft } = useOrderStore();

  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [selectedPriceList, setSelectedPriceList] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  // Working copy of the calculation for manual edits
  const [workCalc, setWorkCalc] = useState<CalculationResult | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const recalcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Client autocomplete state
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<FuzzyClientMatch[]>([]);
  const [clientSearching, setClientSearching] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{ id: number; nombre: string; codigo: string } | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  const preview = draft.preview;
  const calculation = workCalc ?? preview?.calculation ?? null;

  // Load price lists; resolve persisted clientId if any
  useEffect(() => {
    priceListsAPI.getAll().catch(() => []).then((pl) => {
      setPriceLists(pl);
      const active = pl.find((l: PriceList) => l.vigente);
      if (active) setSelectedPriceList(active.id);
    });
    if (draft.clientId) {
      clientsAPI.getById(draft.clientId).catch(() => null).then((c) => {
        if (c) setSelectedClient({ id: c.id, nombre: c.nombre, codigo: c.codigo });
      });
    }
  }, []);

  // Debounced client fuzzy search
  useEffect(() => {
    if (!clientSearch.trim() || clientSearch.length < 2) {
      setClientResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setClientSearching(true);
      try {
        const results: FuzzyClientMatch[] = await clientsAPI.fuzzySearch(clientSearch);
        setClientResults(results.filter((r) => r.confidence !== 'none'));
      } catch {
        setClientResults([]);
      }
      setClientSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [clientSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setShowClientDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup pending recalculate timer on unmount
  useEffect(() => {
    return () => {
      if (recalcTimerRef.current) clearTimeout(recalcTimerRef.current);
    };
  }, []);

  // Sync workCalc when preview changes
  useEffect(() => {
    if (preview?.calculation) setWorkCalc(null);
  }, [preview]);

  const handlePreview = async () => {
    if (!draft.text.trim()) { addToast('Ingresá el texto del pedido', 'warning'); return; }
    setLoading(true);
    try {
      const res: PreviewResult = await ordersAPI.preview(
        draft.text,
        draft.clientId,
        selectedPriceList
      );
      setPreview(res);
      setWorkCalc(null);
      setEditMode(false);
    } catch (e: any) {
      addToast(e.response?.data?.error || 'Error al procesar el pedido', 'error');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!calculation) return;
    setSaving(true);
    try {
      const clientData = preview?.client;
      const res = await ordersAPI.save({
        clientId: clientData?.id ?? draft.clientId,
        clienteNombre: clientData?.nombre ?? preview?.parsed.clientName ?? undefined,
        tipoCalculo: calculation.mode,
        listaPrecioId: selectedPriceList,
        textoOriginal: draft.text,
        calculation,
      });
      clearDraft();
      setSelectedClient(null);
      navigate(`/order/${res.id}`);
    } catch (e: any) {
      addToast(e.response?.data?.error || 'Error al guardar el pedido', 'error');
    }
    setSaving(false);
  };

  const handleCopyDetails = async () => {
    if (!calculation) return;

    const clientName = preview?.client?.nombre ?? preview?.parsed.clientName ?? 'Sin cliente';
    const text = buildOrderCopyText(calculation, clientName);

    try {
      await navigator.clipboard.writeText(text);
      addToast('Detalle del pedido copiado', 'success');
    } catch {
      addToast('No se pudo copiar al portapapeles', 'error');
    }
  };

  // ── Manual line editing ──

  /** Schedules a backend recalculate 400ms after the last edit. */
  function scheduleRecalculate(items: OrderItem[], mode: CalcMode) {
    if (recalcTimerRef.current) clearTimeout(recalcTimerRef.current);
    recalcTimerRef.current = setTimeout(async () => {
      setRecalculating(true);
      try {
        const clientId = draft.clientId ?? preview?.client?.id;
        const result: CalculationResult = await ordersAPI.recalculate({ items, mode, clientId });
        setWorkCalc(result);
      } catch { /* keep optimistic state on network error */ }
      setRecalculating(false);
    }, 400);
  }

  const updateItem = (idx: number, field: keyof OrderItem, value: number) => {
    if (!calculation) return;
    const base = workCalc ?? calculation;
    const items = [...base.items];
    const item = { ...items[idx], [field]: value };
    // Recalculate per-item totals locally for immediate feedback
    if (field === 'cantidad' || field === 'precioAplicado') {
      const qty = field === 'cantidad' ? value : item.cantidad;
      const price = field === 'precioAplicado' ? value : item.precioAplicado;
      item.subtotal = Math.round(qty * price * 100) / 100;
      item.total = item.subtotal;
      if (item.tipoLinea === 'FC_A' && item.iva !== null) {
        const ivaRate = 0.21;
        item.neto = Math.round((item.subtotal / (1 + ivaRate)) * 100) / 100;
        item.iva = Math.round((item.subtotal - item.neto) * 100) / 100;
      }
    }
    items[idx] = item;
    setWorkCalc({ ...base, items });
    scheduleRecalculate(items, base.mode);
  };

  const removeItem = (idx: number) => {
    if (!calculation) return;
    const base = workCalc ?? calculation;
    const items = base.items.filter((_, i) => i !== idx);
    setWorkCalc({ ...base, items });
    scheduleRecalculate(items, base.mode);
  };

  const changeItemType = (idx: number, type: 'FC_A' | 'REMITO' | 'Z') => {
    if (!calculation) return;
    const base = workCalc ?? calculation;
    const items = [...base.items];
    const item = { ...items[idx], tipoLinea: type };
    if (type === 'FC_A') {
      const ivaRate = 0.21;
      item.neto = Math.round((item.subtotal / (1 + ivaRate)) * 100) / 100;
      item.iva = Math.round((item.subtotal - item.neto) * 100) / 100;
    } else {
      item.neto = null;
      item.iva = null;
    }
    items[idx] = item;
    setWorkCalc({ ...base, items });
    scheduleRecalculate(items, base.mode);
  };

  if (!preview && loading) return <LoadingSpinner text="Procesando pedido..." />;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="space-y-4">

        {/* ── Input area ── */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Texto del pedido</h3>
            <button
              onClick={() => setDraftText(EXAMPLE_ORDER)}
              className="text-xs text-brand-600 font-medium"
            >
              Ejemplo
            </button>
          </div>
          <textarea
            value={draft.text}
            onChange={(e) => setDraftText(e.target.value)}
            className="input-field resize-none font-mono text-sm leading-relaxed"
            rows={5}
            placeholder={`Ej: ${EXAMPLE_ORDER}`}
          />

          {/* Client selector */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Cliente (opcional)</label>
              <div className="relative" ref={clientDropdownRef}>
                {selectedClient ? (
                  <div className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm">
                    <span className="flex-1 text-gray-800 font-medium truncate">
                      {selectedClient.nombre}
                      <span className="text-gray-400 font-normal ml-1 text-xs">({selectedClient.codigo})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => { setSelectedClient(null); setDraftClientId(undefined); }}
                      className="text-gray-400 hover:text-gray-600 text-lg leading-none flex-shrink-0"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={(e) => { setClientSearch(e.target.value); setShowClientDropdown(true); }}
                      onFocus={() => { if (clientResults.length > 0) setShowClientDropdown(true); }}
                      placeholder="Buscar cliente..."
                      className="input-field text-sm py-2 w-full"
                    />
                    {clientSearching && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">
                        ...
                      </span>
                    )}
                    {showClientDropdown && clientResults.length > 0 && (
                      <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                        {clientResults.map(({ client, confidence }) => (
                          <button
                            key={client.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSelectedClient(client);
                              setDraftClientId(client.id);
                              setClientSearch('');
                              setClientResults([]);
                              setShowClientDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-2"
                          >
                            <span className="text-sm font-medium flex-1 truncate">{client.nombre}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">{client.codigo}</span>
                            {confidence === 'exact' && <span className="text-xs text-green-500 flex-shrink-0">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Lista de precios</label>
              <select
                value={selectedPriceList ?? ''}
                onChange={(e) => setSelectedPriceList(e.target.value ? parseInt(e.target.value) : undefined)}
                className="input-field text-sm py-2"
              >
                <option value="">Usar lista vigente</option>
                {priceLists.map((pl) => (
                  <option key={pl.id} value={pl.id}>{pl.nombre} {pl.vigente ? '★' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <button onClick={handlePreview} disabled={loading} className="btn-primary w-full">
            {loading ? <InlineSpinner /> : '⚡ Calcular pedido'}
          </button>
        </div>

        {/* ── Preview result ── */}
        {preview && calculation && (
          <>
            {/* Parsed info */}
            <div className="card bg-blue-50 border-blue-200 border space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">
                    Cliente: {preview.client?.nombre ?? preview.parsed.clientName ?? 'No detectado'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Cód: {preview.client?.codigo ?? preview.parsed.clientCode ?? '-'}
                  </p>
                </div>
                <span className="badge-blue text-sm px-3 py-1">{MODE_LABELS[calculation.mode]}</span>
              </div>
              {preview.parsed.warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
                  {preview.parsed.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-yellow-700">⚠ {w}</p>
                  ))}
                </div>
              )}
              {preview.fiscalStatus && preview.fiscalStatus !== 'completo' && preview.client && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2">
                  <p className="text-xs text-orange-700">
                    {preview.fiscalStatus === 'sin_dato'
                      ? 'Cliente sin datos fiscales — percepciones no aplicadas'
                      : 'Cliente con datos fiscales incompletos — verificar percepciones'}
                  </p>
                </div>
              )}
              {preview.clientFuzzyMatches.length > 0 && !preview.client && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 space-y-2">
                  <p className="text-xs font-medium text-amber-800">¿Quisiste decir alguno de estos clientes?</p>
                  <div className="space-y-1">
                    {preview.clientFuzzyMatches.map(({ client, confidence }) => (
                      <button
                        key={client.id}
                        onClick={async () => {
                          setDraftClientId(client.id);
                          setSelectedClient(client);
                          await handlePreview();
                        }}
                        className="w-full flex items-center gap-2 text-left px-2 py-1.5 bg-white rounded border border-amber-200 hover:border-amber-400 transition-colors"
                      >
                        <span className="text-sm font-medium flex-1">{client.nombre}</span>
                        <span className="text-xs text-gray-400">{client.codigo}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${confidence === 'high' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {confidence === 'high' ? 'alta' : 'baja'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Mitad groups banner */}
            {calculation.mode === 'MITAD' && calculation.groupFCA && calculation.groupRemito && (
              <div className="grid grid-cols-2 gap-3">
                <div className="card bg-blue-50 border-blue-200 border">
                  <p className="text-xs font-semibold text-blue-700">Grupo Factura A</p>
                  <p className="text-sm font-bold text-blue-800 mt-0.5">{formatCurrency(calculation.subtotalFCA ?? 0)}</p>
                  <p className="text-xs text-blue-600">{calculation.groupFCA.length} productos</p>
                </div>
                <div className="card bg-gray-50 border-gray-200 border">
                  <p className="text-xs font-semibold text-gray-700">Grupo Remito</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{formatCurrency(calculation.subtotalRemito ?? 0)}</p>
                  <p className="text-xs text-gray-600">{calculation.groupRemito.length} productos</p>
                </div>
              </div>
            )}

            {/* Items table */}
            <div className="card p-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <p className="font-semibold text-gray-800 text-sm">
                  {calculation.items.length} líneas
                </p>
                <button
                  onClick={() => setEditMode((e) => !e)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                    editMode
                      ? 'bg-brand-100 text-brand-700 border-brand-200'
                      : 'bg-gray-50 text-gray-600 border-gray-200'
                  }`}
                >
                  {editMode ? '✓ Editando' : '✎ Editar'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Cód</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Descripción</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Cant</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Precio</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Total</th>
                      {editMode && <th className="px-2 py-2"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {calculation.items.map((item, idx) => (
                      <tr
                        key={idx}
                        className={`${item.notFound ? 'bg-red-50' : ''} ${
                          item.tipoLinea === 'FC_A' ? 'bg-blue-50/30' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5 font-mono font-medium text-brand-700">{item.codigo}</td>
                        <td className="px-3 py-2.5 text-gray-700 max-w-[120px]">
                          <p className="truncate">{item.descripcion}</p>
                          <div className="flex gap-1 mt-0.5 flex-wrap">
                            {editMode ? (
                              <select
                                value={item.tipoLinea}
                                onChange={(e) => changeItemType(idx, e.target.value as any)}
                                className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white"
                              >
                                <option value="FC_A">FC A</option>
                                <option value="REMITO">Remito</option>
                                <option value="Z">Z</option>
                              </select>
                            ) : (
                              <span className={`badge text-[10px] ${
                                item.tipoLinea === 'FC_A' ? 'badge-blue' : 'badge-gray'
                              }`}>
                                {item.tipoLinea}
                              </span>
                            )}
                            {item.isMitad && <span className="badge badge-yellow text-[10px]">½</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {editMode ? (
                            <input
                              type="number"
                              min="0.1"
                              step="0.5"
                              value={item.cantidad}
                              onChange={(e) => updateItem(idx, 'cantidad', parseFloat(e.target.value) || 0)}
                              className="w-14 text-right border border-gray-200 rounded px-1 py-0.5 text-xs"
                            />
                          ) : (
                            <span className="font-medium">{item.cantidad}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {editMode ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.precioAplicado}
                              onChange={(e) => updateItem(idx, 'precioAplicado', parseFloat(e.target.value) || 0)}
                              className="w-20 text-right border border-gray-200 rounded px-1 py-0.5 text-xs"
                            />
                          ) : (
                            <span>{formatCurrency(item.precioAplicado)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-gray-800">
                          {item.notFound ? (
                            <span className="text-red-500 text-[10px]">No encontrado</span>
                          ) : (
                            formatCurrency(item.total)
                          )}
                        </td>
                        {editMode && (
                          <td className="px-2 py-2.5">
                            <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                              ×
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="card space-y-2 relative">
              {recalculating && (
                <span className="absolute top-3 right-3 text-xs text-gray-400">Recalculando...</span>
              )}
              {calculation.subtotalNeto > 0 && (
                <>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Subtotal neto</span>
                    <span>{formatCurrency(calculation.subtotalNeto)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>IVA</span>
                    <span>{formatCurrency(calculation.ivaTotal)}</span>
                  </div>
                  {calculation.percepcionIva > 0 && (
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>{calculation.mode === 'MITAD' ? 'Percepción IVA aprox.' : 'IVA estimado (3%)'}</span>
                      <span>{formatCurrency(calculation.percepcionIva)}</span>
                    </div>
                  )}
                  <div className="border-t border-gray-100 pt-2" />
                </>
              )}
              {calculation.mode === 'MITAD' && (
                <>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Subtotal FC A</span>
                    <span>{formatCurrency(calculation.subtotalFCA ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Subtotal Remito</span>
                    <span>{formatCurrency(calculation.subtotalRemito ?? 0)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-lg font-bold text-gray-900">
                <span>TOTAL</span>
                <span className="text-brand-700">{formatCurrency(calculation.totalFinal)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => { setPreview(preview); setWorkCalc(null); setEditMode(false); handlePreview(); }}
                className="btn-secondary"
              >
                Recalcular
              </button>
              <button onClick={handleCopyDetails} className="btn-secondary">
                Copiar detalle
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? <InlineSpinner /> : '✓ Confirmar pedido'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function buildOrderCopyText(calculation: CalculationResult, clientName: string): string {
  const totalFCA = round2(
    calculation.items
      .filter((item) => item.tipoLinea === 'FC_A')
      .reduce((acc, item) => acc + item.total, 0),
  );
  const totalRemito = round2(
    calculation.items
      .filter((item) => item.tipoLinea !== 'FC_A')
      .reduce((acc, item) => acc + item.total, 0),
  );
  const totalFCAConPercepciones = round2(totalFCA + calculation.percepcionIva);

  const lines: string[] = [
    `Cliente: ${clientName}`,
    `Fecha: ${new Date().toLocaleDateString('es-AR')}`,
    '',
  ];

  if (calculation.percepcionIva > 0) {
    lines.push(`Total FC A (con percepciones): ${formatCurrency(totalFCAConPercepciones)}`);
  } else {
    lines.push(`Total FC A: ${formatCurrency(totalFCA)}`);
  }
  lines.push(`Total Remito: ${formatCurrency(totalRemito)}`);

  return lines.join('\n');
}

function round2(n: number) { return Math.round(n * 100) / 100; }

