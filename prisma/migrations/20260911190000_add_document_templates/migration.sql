CREATE TABLE "DocumentTemplate" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT,
  "name" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DocumentTemplate_workspaceId_type_idx" ON "DocumentTemplate"("workspaceId","documentType","active");

CREATE TABLE "DocumentTemplateVersion" (
  "id" TEXT PRIMARY KEY,
  "templateId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "content" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "DocumentTemplateVersion_templateId_version_key" ON "DocumentTemplateVersion"("templateId","version");

CREATE TABLE "RenderedDocument" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "templateId" TEXT,
  "templateVersionId" TEXT,
  "ownerId" TEXT NOT NULL,
  "documentId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "storageKey" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RenderedDocument_workspaceId_createdAt_idx" ON "RenderedDocument"("workspaceId","createdAt");
