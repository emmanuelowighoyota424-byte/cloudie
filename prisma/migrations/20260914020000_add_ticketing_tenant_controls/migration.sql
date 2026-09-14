CREATE TABLE "TicketingDocument" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "documentId" TEXT,
  "pointsCharged" INTEGER NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TicketingDocument_idempotencyKey_key" ON "TicketingDocument"("idempotencyKey");
CREATE INDEX "TicketingDocument_userId_createdAt_idx" ON "TicketingDocument"("userId","createdAt");
CREATE INDEX "TicketingDocument_workspaceId_type_idx" ON "TicketingDocument"("workspaceId","type");

CREATE TABLE "TenantProfile" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "siteType" TEXT NOT NULL DEFAULT 'BANK',
  "logoUrl" TEXT,
  "primaryColor" TEXT NOT NULL DEFAULT '#111827',
  "siteTitle" TEXT,
  "faviconUrl" TEXT,
  "contactEmail" TEXT,
  "lockedAt" TIMESTAMP(3),
  "renewalDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TenantProfile_workspaceId_key" ON "TenantProfile"("workspaceId");
CREATE INDEX "TenantProfile_siteType_idx" ON "TenantProfile"("siteType");

CREATE TABLE "TenantDomain" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "hostname" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "verificationToken" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TenantDomain_hostname_key" ON "TenantDomain"("hostname");
CREATE INDEX "TenantDomain_workspaceId_status_idx" ON "TenantDomain"("workspaceId","status");
