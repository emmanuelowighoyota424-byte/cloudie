ALTER TABLE "EmailMessage" ADD COLUMN "pointsCharged" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EmailCampaign" ADD COLUMN "pointsCharged" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "EmailMessage_workspaceId_status_createdAt_idx" ON "EmailMessage"("workspaceId","status","createdAt");
