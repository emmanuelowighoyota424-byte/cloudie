CREATE TABLE "TenantLedgerEntry" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" NUMERIC(20,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "description" TEXT NOT NULL,
  "reference" TEXT,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TenantLedgerEntry_workspaceId_createdAt_idx" ON "TenantLedgerEntry"("workspaceId","createdAt");
CREATE INDEX "TenantLedgerEntry_userId_createdAt_idx" ON "TenantLedgerEntry"("userId","createdAt");
CREATE INDEX "TenantLedgerEntry_workspaceId_userId_idx" ON "TenantLedgerEntry"("workspaceId","userId");
