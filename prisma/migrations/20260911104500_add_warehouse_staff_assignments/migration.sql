CREATE TABLE "WarehouseStaffAssignment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseStaffAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WarehouseStaffAssignment_warehouseId_userId_key" ON "WarehouseStaffAssignment"("warehouseId", "userId");
CREATE INDEX "WarehouseStaffAssignment_workspaceId_userId_idx" ON "WarehouseStaffAssignment"("workspaceId", "userId");
CREATE INDEX "WarehouseStaffAssignment_userId_idx" ON "WarehouseStaffAssignment"("userId");

ALTER TABLE "WarehouseStaffAssignment" ADD CONSTRAINT "WarehouseStaffAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WarehouseStaffAssignment" ADD CONSTRAINT "WarehouseStaffAssignment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WarehouseStaffAssignment" ADD CONSTRAINT "WarehouseStaffAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
