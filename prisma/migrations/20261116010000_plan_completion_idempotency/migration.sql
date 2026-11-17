ALTER TABLE "InventoryLog" ADD COLUMN "idempotency_key" TEXT;
ALTER TABLE "InventoryLog" ADD COLUMN "debt_qty" REAL NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "InventoryLog_idempotency_key_key" ON "InventoryLog"("idempotency_key");
