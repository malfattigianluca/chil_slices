-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clienteId" INTEGER,
    "clienteNombre" TEXT,
    "vendedorId" INTEGER,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipoCalculo" TEXT NOT NULL,
    "subtotalNeto" REAL NOT NULL DEFAULT 0,
    "ivaTotal" REAL NOT NULL DEFAULT 0,
    "percepcionIva" REAL NOT NULL DEFAULT 0,
    "percepcionIibb" REAL NOT NULL DEFAULT 0,
    "totalFinal" REAL NOT NULL DEFAULT 0,
    "listaPrecioId" INTEGER,
    "observaciones" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "textoOriginal" TEXT,
    "nroPedidoDia" INTEGER,
    "estadoEnvio" TEXT NOT NULL DEFAULT 'pendiente',
    "fechaEnvio" DATETIME,
    "mailDestinatario" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_listaPrecioId_fkey" FOREIGN KEY ("listaPrecioId") REFERENCES "PriceList" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("clienteId", "clienteNombre", "createdAt", "estado", "fecha", "id", "ivaTotal", "listaPrecioId", "observaciones", "percepcionIibb", "percepcionIva", "subtotalNeto", "textoOriginal", "tipoCalculo", "totalFinal", "updatedAt", "vendedorId") SELECT "clienteId", "clienteNombre", "createdAt", "estado", "fecha", "id", "ivaTotal", "listaPrecioId", "observaciones", "percepcionIibb", "percepcionIva", "subtotalNeto", "textoOriginal", "tipoCalculo", "totalFinal", "updatedAt", "vendedorId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE TABLE "new_OrderItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "productoId" INTEGER,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" REAL NOT NULL,
    "cantidadBonificada" REAL NOT NULL DEFAULT 0,
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
INSERT INTO "new_OrderItem" ("cantidad", "codigo", "descripcion", "id", "isMitad", "iva", "neto", "orderId", "precioAplicado", "productoId", "subtotal", "tipoLinea", "total") SELECT "cantidad", "codigo", "descripcion", "id", "isMitad", "iva", "neto", "orderId", "precioAplicado", "productoId", "subtotal", "tipoLinea", "total" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
