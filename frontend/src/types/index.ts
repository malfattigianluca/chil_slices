// ─── Auth ────────────────────────────────────────────────
export interface User {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'seller';
}

// ─── Client ──────────────────────────────────────────────
export interface Client {
  id: number;
  codigo: string;
  cuit: string | null;
  nombre: string;
  condicionFiscal: string | null;
  tipoComprobanteHabitual: 'FC_A' | 'REMITO' | 'Z' | 'MITAD';
  aplicaPercepcionIva: boolean;
  alicuotaPercepcionIva: number;
  alicuotaPercepcionIibb: number | null;
  iibbPadronPeriodo: string | null;
  iibbPadronActualizadoAt?: string | null;
  direccion: string | null;
  telefono: string | null;
  zona: string | null;
  observaciones: string | null;
  active: boolean;
  createdAt: string;
}

// ─── Product ─────────────────────────────────────────────
export interface Product {
  id: number;
  codigo: string;
  descripcion: string;
  precioUnidad: number;
  precioBulto: number | null;
  ivaPorcentaje: number;
  activo: boolean;
  listaPrecioId: number;
}

// ─── PriceList ───────────────────────────────────────────
export interface PriceList {
  id: number;
  nombre: string;
  version: string | null;
  fechaCarga: string;
  vigente: boolean;
  _count?: { products: number };
  products?: Product[];
}

// ─── Order ───────────────────────────────────────────────
export type CalcMode = 'FC_A' | 'MITAD' | 'Z' | 'REMITO';

export interface OrderItem {
  id?: number;
  productoId: number | null;
  codigo: string;
  descripcion: string;
  cantidad: number;
  cantidadBonificada: number;
  precioUnidad: number;
  precioBulto: number | null;
  precioAplicado: number;
  subtotal: number;
  neto: number | null;
  iva: number | null;
  total: number;
  tipoLinea: 'FC_A' | 'REMITO' | 'Z';
  isMitad: boolean;
  notFound: boolean;
}

export interface CalculationResult {
  mode: CalcMode;
  items: OrderItem[];
  subtotalNeto: number;
  ivaTotal: number;
  percepcionIva: number;
  percepcionIibb: number;
  aplicaPercepcionIva: boolean;
  alicuotaPercepcionIva: number;
  alicuotaPercepcionIibb: number;
  totalFinal: number;
  groupFCA: OrderItem[] | null;
  groupRemito: OrderItem[] | null;
  subtotalFCA: number | null;
  subtotalRemito: number | null;
}

export interface ParsedOrder {
  clientName: string | null;
  clientCode: string | null;
  calcMode: CalcMode;
  items: { code: string; quantity: number; isMitad: boolean }[];
  observaciones: string | null;
  rawText: string;
  warnings: string[];
}

export type FiscalStatus = 'completo' | 'parcial' | 'sin_dato';

export interface PreviewResult {
  parsed: ParsedOrder;
  calculation: CalculationResult;
  client: Client | null;
  clientFuzzyMatches: FuzzyClientMatch[];
  fiscalStatus: FiscalStatus;
}

export interface Order {
  id: number;
  clienteId: number | null;
  clienteNombre: string | null;
  cliente: { id: number; nombre: string; codigo: string } | null;
  vendedor: { id: number; name: string } | null;
  priceList: { id: number; nombre: string; version: string | null } | null;
  fecha: string;
  tipoCalculo: CalcMode;
  subtotalNeto: number;
  ivaTotal: number;
  percepcionIva?: number;
  percepcionIibb?: number;
  totalFinal: number;
  observaciones: string | null;
  estado: 'borrador' | 'confirmado';
  textoOriginal: string | null;
  items: OrderItem[];
  createdAt: string;
}

export interface OrderSummary {
  id: number;
  clienteNombre: string | null;
  cliente: { id: number; nombre: string; codigo: string } | null;
  vendedor: { id: number; name: string } | null;
  fecha: string;
  tipoCalculo: CalcMode;
  totalFinal: number;
  estado: string;
  estadoEnvio: string;
  nroPedidoDia: number | null;
  _count: { items: number };
}

// ─── Metrics ─────────────────────────────────────────────
export interface Metrics {
  total: number;
  confirmed: number;
  today: number;
  totalVentas: number;
}

// ─── Fuzzy client match ──────────────────────────────────
export interface FuzzyClientMatch {
  client: { id: number; codigo: string; nombre: string };
  confidence: 'exact' | 'high' | 'low' | 'none';
  score: number;
}

// ─── API responses ───────────────────────────────────────
export interface PaginatedOrders {
  orders: OrderSummary[];
  total: number;
}
