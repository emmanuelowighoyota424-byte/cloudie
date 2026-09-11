DROP INDEX IF EXISTS "EmailMessage_workspaceId_idempotency_key";
ALTER TABLE "EmailMessage" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "EmailMessage_workspaceId_idempotencyKey_key" ON "EmailMessage"("workspaceId","idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
