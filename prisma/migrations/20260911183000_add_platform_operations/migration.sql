CREATE TABLE "MarketplaceDispute" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderItemId" TEXT,
  "customerId" TEXT,
  "vendorId" TEXT,
  "openedById" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MarketplaceDispute_workspaceId_status_idx" ON "MarketplaceDispute"("workspaceId","status");
CREATE INDEX "MarketplaceDispute_orderId_idx" ON "MarketplaceDispute"("orderId");
CREATE INDEX "MarketplaceDispute_openedById_idx" ON "MarketplaceDispute"("openedById");

CREATE TABLE "PointPricingRule" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT,
  "action" TEXT NOT NULL,
  "pointCost" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PointPricingRule_scope_action_idx" ON "PointPricingRule"("workspaceId","action","enabled");

CREATE TABLE "CloudieJob" (
  "id" TEXT PRIMARY KEY,
  "type" TEXT NOT NULL,
  "workspaceId" TEXT,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CloudieJob_idempotencyKey_key" ON "CloudieJob"("idempotencyKey");
CREATE INDEX "CloudieJob_status_runAt_idx" ON "CloudieJob"("status","runAt");
CREATE INDEX "CloudieJob_workspaceId_createdAt_idx" ON "CloudieJob"("workspaceId","createdAt");

CREATE TABLE "EmailMessage" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT,
  "userId" TEXT,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'resend',
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EmailMessage_status_createdAt_idx" ON "EmailMessage"("status","createdAt");
CREATE INDEX "EmailMessage_workspaceId_createdAt_idx" ON "EmailMessage"("workspaceId","createdAt");

CREATE TABLE "EmailCampaign" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "audience" JSONB NOT NULL,
  "scheduledAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EmailCampaign_workspaceId_status_idx" ON "EmailCampaign"("workspaceId","status");

CREATE TABLE "CloudieAsset" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "url" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3)
);
CREATE INDEX "CloudieAsset_workspaceId_createdAt_idx" ON "CloudieAsset"("workspaceId","createdAt");

CREATE TABLE "CryptoDeposit" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "asset" TEXT NOT NULL,
  "network" TEXT NOT NULL,
  "address" TEXT,
  "expectedAmount" NUMERIC(30,12),
  "txHash" TEXT,
  "confirmations" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "providerReference" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "CryptoDeposit_providerReference_key" ON "CryptoDeposit"("provider","providerReference");
CREATE INDEX "CryptoDeposit_workspaceId_status_idx" ON "CryptoDeposit"("workspaceId","status");
CREATE INDEX "CryptoDeposit_userId_createdAt_idx" ON "CryptoDeposit"("userId","createdAt");

CREATE TABLE "KYCEvent" (
  "id" TEXT PRIMARY KEY,
  "kycId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "KYCEvent_kycId_createdAt_idx" ON "KYCEvent"("kycId","createdAt");

CREATE TABLE "BusinessInvoice" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "customerId" TEXT,
  "createdById" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "subtotal" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "tax" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "total" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "dueAt" TIMESTAMP(3),
  "items" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BusinessInvoice_workspaceId_number_key" ON "BusinessInvoice"("workspaceId","number");
CREATE INDEX "BusinessInvoice_workspaceId_status_idx" ON "BusinessInvoice"("workspaceId","status");

CREATE TABLE "BusinessDepartment" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BusinessDepartment_workspaceId_name_key" ON "BusinessDepartment"("workspaceId","name");

CREATE TABLE "BusinessStaff" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "departmentId" TEXT,
  "role" TEXT NOT NULL DEFAULT 'STAFF',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BusinessStaff_workspaceId_userId_key" ON "BusinessStaff"("workspaceId","userId");
CREATE INDEX "BusinessStaff_workspaceId_role_idx" ON "BusinessStaff"("workspaceId","role");
