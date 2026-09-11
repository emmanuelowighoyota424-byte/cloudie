import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type DisputeRow = {
  id: string; workspaceId: string; orderId: string; orderItemId: string | null; customerId: string | null; vendorId: string | null; openedById: string; reason: string; description: string; status: string; resolution: string | null; resolvedById: string | null; resolvedAt: Date | null; createdAt: Date; updatedAt: Date
}

export async function createDispute(input: { id: string; workspaceId: string; orderId: string; orderItemId?: string | null; customerId?: string | null; vendorId?: string | null; openedById: string; reason: string; description: string }) {
  const rows = await prisma.$queryRaw<DisputeRow[]>(Prisma.sql`INSERT INTO "MarketplaceDispute" ("id","workspaceId","orderId","orderItemId","customerId","vendorId","openedById","reason","description") VALUES (${input.id},${input.workspaceId},${input.orderId},${input.orderItemId ?? null},${input.customerId ?? null},${input.vendorId ?? null},${input.openedById},${input.reason},${input.description}) RETURNING *`)
  return rows[0]
}

export async function listDisputes(workspaceId: string, userId: string, isAdmin: boolean) {
  return prisma.$queryRaw<DisputeRow[]>(isAdmin ? Prisma.sql`SELECT * FROM "MarketplaceDispute" WHERE "workspaceId"=${workspaceId} ORDER BY "createdAt" DESC LIMIT 100` : Prisma.sql`SELECT * FROM "MarketplaceDispute" WHERE "workspaceId"=${workspaceId} AND ("openedById"=${userId} OR "customerId"=${userId}) ORDER BY "createdAt" DESC LIMIT 100`)
}

export async function updateDispute(id: string, workspaceId: string, actorId: string, status: string, resolution: string | null) {
  const rows = await prisma.$queryRaw<DisputeRow[]>(Prisma.sql`UPDATE "MarketplaceDispute" SET "status"=${status},"resolution"=${resolution},"resolvedById"=CASE WHEN ${status} IN ('RESOLVED','REJECTED','CANCELLED') THEN ${actorId} ELSE "resolvedById" END,"resolvedAt"=CASE WHEN ${status} IN ('RESOLVED','REJECTED','CANCELLED') THEN CURRENT_TIMESTAMP ELSE "resolvedAt" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id} AND "workspaceId"=${workspaceId} RETURNING *`)
  return rows[0]
}

export async function queueJob(type: string, payload: unknown, options: { workspaceId?: string; idempotencyKey?: string; runAt?: Date } = {}) {
  const id = crypto.randomUUID()
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`INSERT INTO "CloudieJob" ("id","type","workspaceId","payload","runAt","idempotencyKey") VALUES (${id},${type},${options.workspaceId ?? null},${JSON.stringify(payload)}::jsonb,${options.runAt ?? new Date()},${options.idempotencyKey ?? null}) ON CONFLICT ("idempotencyKey") DO UPDATE SET "id"="CloudieJob"."id" RETURNING "id"`)
  return rows[0].id
}
