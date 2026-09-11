CREATE TABLE "KYCSubmission" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "kycId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "KYCSubmission_userId_status_idx" ON "KYCSubmission"("userId","status");
CREATE INDEX "KYCSubmission_kycId_createdAt_idx" ON "KYCSubmission"("kycId","createdAt");
