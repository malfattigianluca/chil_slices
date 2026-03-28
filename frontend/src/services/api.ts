import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
});

// Inject auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────
export const authAPI = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }).then((r) => r.data),
  profile: () => api.get('/auth/profile').then((r) => r.data),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.put('/auth/password', { oldPassword, newPassword }).then((r) => r.data),
  register: (data: { username: string; password: string; name: string; role?: string }) =>
    api.post('/auth/register', data).then((r) => r.data),
};

// ─── Clients ─────────────────────────────────────────────
export const clientsAPI = {
  getAll: (search?: string) =>
    api.get('/clients', { params: search ? { search } : {} }).then((r) => r.data),
  getById: (id: number) => api.get(`/clients/${id}`).then((r) => r.data),
  fuzzySearch: (q: string) =>
    api.get('/clients/fuzzy', { params: { q } }).then((r) => r.data),
  create: (data: object) => api.post('/clients', data).then((r) => r.data),
  update: (id: number, data: object) => api.put(`/clients/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/clients/${id}`).then((r) => r.data),
  importCSV: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/clients/import/csv', fd).then((r) => r.data);
  },
  importArbaPadron: (file: File, periodo?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    if (periodo) fd.append('periodo', periodo);
    return api.post('/clients/import/arba-padron', fd).then((r) => r.data);
  },
};

// ─── Price Lists ─────────────────────────────────────────
export const priceListsAPI = {
  getAll: () => api.get('/price-lists').then((r) => r.data),
  getById: (id: number) => api.get(`/price-lists/${id}`).then((r) => r.data),
  getActive: () => api.get('/price-lists/active').then((r) => r.data),
  uploadPDF: (file: File, meta: { nombre: string; version?: string; vigente?: boolean; ivaPorcentaje?: number }) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('nombre', meta.nombre);
    if (meta.version) fd.append('version', meta.version);
    fd.append('vigente', String(meta.vigente ?? false));
    fd.append('ivaPorcentaje', String(meta.ivaPorcentaje ?? 21));
    return api.post('/price-lists/upload', fd).then((r) => r.data);
  },
  previewPDF: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/price-lists/preview', fd).then((r) => r.data);
  },
  createManual: (data: object) => api.post('/price-lists/manual', data).then((r) => r.data),
  activate: (id: number) => api.put(`/price-lists/${id}/activate`).then((r) => r.data),
  delete: (id: number) => api.delete(`/price-lists/${id}`).then((r) => r.data),
  updateProduct: (productId: number, data: object) =>
    api.put(`/price-lists/products/${productId}`, data).then((r) => r.data),
};

// ─── Mail ────────────────────────────────────────────────
export const mailAPI = {
  sendOrder: (orderId: number, destinatario: string) =>
    api.post(`/mail/orders/${orderId}/send`, { destinatario }).then((r) => r.data),
  sendBatch: (destinatario: string) =>
    api.post('/mail/batch/send', { destinatario }).then((r) => r.data),
};

// ─── Orders ──────────────────────────────────────────────
export const ordersAPI = {
  preview: (text: string, clientId?: number, priceListId?: number) =>
    api.post('/orders/preview', { text, clientId, priceListId }).then((r) => r.data),
  recalculate: (data: { mode: string; items: object[]; clientId?: number }) =>
    api.post('/orders/recalculate', data).then((r) => r.data),
  save: (data: object) => api.post('/orders', data).then((r) => r.data),
  getAll: (params?: object) => api.get('/orders', { params }).then((r) => r.data),
  getById: (id: number) => api.get(`/orders/${id}`).then((r) => r.data),
  getPDFUrl: (id: number) => `${BASE_URL}/orders/${id}/pdf`,
  updateEstado: (id: number, estado: string) =>
    api.put(`/orders/${id}/estado`, { estado }).then((r) => r.data),
  delete: (id: number) => api.delete(`/orders/${id}`).then((r) => r.data),
  metrics: () => api.get('/orders/metrics').then((r) => r.data),
};
