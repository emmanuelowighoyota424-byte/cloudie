ALTER TABLE "PointLedger" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
CREATE INDEX IF NOT EXISTS "PointLedger_workspaceId_createdAt_idx" ON "PointLedger"("workspaceId","createdAt");
