ALTER TABLE "RenderedDocument" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "RenderedDocument_workspaceId_idempotencyKey_key" ON "RenderedDocument"("workspaceId","idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE UNIQUE INDEX "MarketplaceDispute_orderId_openedById_active_key" ON "MarketplaceDispute"("orderId","openedById") WHERE "status" IN ('OPEN','UNDER_REVIEW','AWAITING_VENDOR','AWAITING_CUSTOMER');
CREATE UNIQUE INDEX "EmailMessage_workspaceId_idempotency_key" ON "EmailMessage"("workspaceId","recipient","subject","template") WHERE "status" IN ('QUEUED','SENDING','SENT');
CREATE INDEX "KYCSubmission_storageKey_idx" ON "KYCSubmission"("storageKey");
CREATE INDEX "KYCSubmission_userId_createdAt_idx" ON "KYCSubmission"("userId","createdAt");
