DROP INDEX IF EXISTS "EmailMessage_workspaceId_idempotencyKey_key";
CREATE UNIQUE INDEX "EmailMessage_idempotencyKey_key" ON "EmailMessage"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
