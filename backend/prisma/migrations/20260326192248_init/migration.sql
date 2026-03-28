-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'seller',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Client" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "condicionFiscal" TEXT,
    "tipoComprobanteHabitual" TEXT NOT NULL DEFAULT 'Z',
    "direccion" TEXT,
    "telefono" TEXT,
    "zona" TEXT,
    "observaciones" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "version" TEXT,
    "fechaCarga" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigente" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "precioUnidad" REAL NOT NULL,
    "precioBulto" REAL,
    "ivaPorcentaje" REAL NOT NULL DEFAULT 21,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "listaPrecioId" INTEGER NOT NULL,
    CONSTRAINT "Product_listaPrecioId_fkey" FOREIGN KEY ("listaPrecioId") REFERENCES "PriceList" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clienteId" INTEGER,
    "clienteNombre" TEXT,
    "vendedorId" INTEGER,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipoCalculo" TEXT NOT NULL,
    "subtotalNeto" REAL NOT NULL DEFAULT 0,
    "ivaTotal" REAL NOT NULL DEFAULT 0,
    "totalFinal" REAL NOT NULL DEFAULT 0,
    "listaPrecioId" INTEGER,
    "observaciones" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "textoOriginal" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_listaPrecioId_fkey" FOREIGN KEY ("listaPrecioId") REFERENCES "PriceList" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "productoId" INTEGER,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" REAL NOT NULL,
    "tipoLinea" TEXT NOT NULL,
    "precioAplicado" REAL NOT NULL,
    "subtotal" REAL NOT NULL,
    "neto" REAL,
    "iva" REAL,
    "total" REAL NOT NULL,
    "isMitad" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Client_codigo_key" ON "Client"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Product_codigo_listaPrecioId_key" ON "Product"("codigo", "listaPrecioId");
