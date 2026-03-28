# Chil Slices — Sistema de Pedidos Mayoristas

PWA + API REST para vendedores que calculan notas de pedido a partir de una lista de precios en PDF.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| PWA | vite-plugin-pwa (instalable en Android) |
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma |
| Base de datos | SQLite (local) |
| PDF extracción | pdf-parse |
| PDF exportación | PDFKit |
| Auth | JWT + bcryptjs |

---

## Instalación y primer arranque

### Requisitos
- Node.js 18+
- npm 9+

### 1. Instalar dependencias

```bash
cd H:\Chil_Slices

# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configurar el backend

El archivo `backend/.env` ya viene preconfigurado para desarrollo:

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="chil-slices-super-secret-jwt-key-change-in-production"
PORT=3001
```

**IMPORTANTE:** Cambiar `JWT_SECRET` antes de usar en producción.

### 3. Crear la base de datos

```bash
cd backend
npx prisma migrate dev --name init
npx prisma generate
npm run prisma:seed    # crea usuario admin/admin123
```

### 4. Ejecutar en desarrollo

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
# → http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# → http://localhost:5173
```

Abrir el navegador en **http://localhost:5173**

**Login inicial:** usuario `admin` / contraseña `admin123`

---

## Lógica de negocio

### Formato del pedido

```
[NombreCliente] - [CodigoCliente]: [ModoCalculo] - [cod=cant] - [cod=cant] ...
```

Ejemplo:
```
Rojo - 339: mitad - 506=10 - 524=1 - 655=1 - 611=3 - 612=3 - 609=4
```

**Todo lo que está antes del `:` es el cliente** (nombre - código).
**Lo que viene después del `:` es el modo y los productos.**

### Modos de cálculo

| Modo | Comportamiento |
|------|---------------|
| `FC A` | Deduce IVA: `neto = precio / 1.21` · Discrimina impuestos |
| `mitad` | Primera mitad → FC A · Segunda mitad + impares → Remito |
| `Z` | Precio de lista directo · Sin discriminar IVA |
| `Remito` | Igual que Z |

### Regla de precio por producto

1. **Prioriza `precioBulto`**
2. Si el producto tiene `mitad` individual → `precio = precioBulto * 0.5`
3. Si no hay `precioBulto` → usa `precioUnidad`
4. **Los precios de lista ya incluyen IVA**

---

## Carga de lista de precios (PDF)

El sistema intenta extraer la tabla del PDF usando heurísticas:
- Líneas que comienzan con código numérico (3-8 dígitos)
- Los últimos 1-2 valores numéricos de la línea son precios
- El texto entre código y precios es la descripción

**Si la extracción no es perfecta**, se puede editar cada producto manualmente desde la app.

### Formato CSV para clientes

Columnas (separador `;`):

```
codigo;nombre;condicionFiscal;tipoComprobante;direccion;telefono;zona;observaciones
C001;El Rojo;Monotributo;FC_A;Av. Corrientes 1234;+54911...;Centro;
```

---

## Estructura del proyecto

```
Chil_Slices/
├── backend/
│   ├── prisma/schema.prisma          # Modelo de datos
│   ├── src/
│   │   ├── index.ts                  # Entry point Express
│   │   ├── modules/
│   │   │   ├── auth/                 # Login, JWT
│   │   │   ├── clients/              # CRUD + import CSV
│   │   │   ├── price-lists/          # Upload PDF, extracción
│   │   │   ├── products/             # CRUD productos
│   │   │   ├── parser/               # Parser de texto libre
│   │   │   ├── calculator/           # Motor FC A / Mitad / Z
│   │   │   ├── orders/               # Pedidos
│   │   │   └── export/               # Generación PDF
│   │   └── middleware/
└── frontend/
    └── src/
        ├── pages/
        │   ├── Login.tsx
        │   ├── Dashboard.tsx         # Métricas
        │   ├── NewOrder.tsx          # Parser + Calculador
        │   ├── OrderResult.tsx       # Detalle + Export
        │   ├── History.tsx           # Historial
        │   ├── Clients.tsx           # Gestión clientes
        │   ├── PriceList.tsx         # Listas de precios
        │   └── Settings.tsx
        ├── store/                    # Zustand
        ├── services/api.ts           # Axios API client
        └── types/index.ts            # TypeScript types
```

---

## Compilar para producción

### Backend

```bash
cd backend
npm run build
# Output en dist/
node dist/index.js
```

### Frontend (PWA)

```bash
cd frontend
npm run build
# Output en dist/ → servir con nginx o similar
```

### Instalar como PWA en Android

1. Abrir Chrome en el celular
2. Navegar a la URL del servidor
3. Menú → "Agregar a pantalla de inicio"
4. La app se instala como app nativa

---

## Variables de entorno (producción)

### backend/.env
```env
DATABASE_URL="file:./prod.db"           # O PostgreSQL: postgresql://user:pass@host/db
JWT_SECRET="clave-muy-segura-min-32-chars"
JWT_EXPIRES_IN="7d"
PORT=3001
NODE_ENV=production
UPLOAD_DIR="./uploads"
```

### frontend/.env.production
```env
VITE_API_URL=https://tu-dominio.com/api
```

---

## Migrar a PostgreSQL

1. Cambiar `DATABASE_URL` en `.env`
2. En `prisma/schema.prisma` cambiar `provider = "postgresql"`
3. Ejecutar `npx prisma migrate deploy`

---

## API endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| GET | `/api/clients` | Listar clientes |
| POST | `/api/clients/import/csv` | Importar CSV |
| GET | `/api/price-lists/active` | Lista vigente |
| POST | `/api/price-lists/upload` | Subir PDF |
| POST | `/api/price-lists/preview` | Preview PDF |
| POST | `/api/orders/preview` | Calcular pedido (sin guardar) |
| POST | `/api/orders` | Guardar pedido |
| GET | `/api/orders/:id/pdf` | Exportar PDF |
| GET | `/api/orders/metrics` | Métricas |
