-- AlterTable
ALTER TABLE "Client" ADD COLUMN "cuit" TEXT;
ALTER TABLE "Client" ADD COLUMN "aplicaPercepcionIva" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Client" ADD COLUMN "alicuotaPercepcionIva" REAL NOT NULL DEFAULT 3;
ALTER TABLE "Client" ADD COLUMN "alicuotaPercepcionIibb" REAL;
ALTER TABLE "Client" ADD COLUMN "iibbPadronPeriodo" TEXT;
ALTER TABLE "Client" ADD COLUMN "iibbPadronActualizadoAt" DATETIME;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "percepcionIva" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "percepcionIibb" REAL NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Client_cuit_key" ON "Client"("cuit");
