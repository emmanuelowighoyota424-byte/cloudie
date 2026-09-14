CREATE TABLE "BusinessInvestmentPlan" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "minimumAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "termDays" INTEGER NOT NULL DEFAULT 30,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BusinessInvestmentPlan_workspaceId_name_key" ON "BusinessInvestmentPlan"("workspaceId","name");
CREATE INDEX "BusinessInvestmentPlan_workspaceId_status_idx" ON "BusinessInvestmentPlan"("workspaceId","status");

CREATE TABLE "BusinessBillingConfig" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL UNIQUE,
  "renewalPoints" INTEGER NOT NULL DEFAULT 0,
  "autoRenew" BOOLEAN NOT NULL DEFAULT FALSE,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
