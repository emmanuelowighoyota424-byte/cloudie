import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export async function getPointCost(action: string, workspaceId?: string) {
  const rows = await prisma.$queryRaw<{ pointCost: number }[]>(Prisma.sql`SELECT "pointCost" FROM "PointPricingRule" WHERE "action"=${action} AND "enabled"=TRUE AND "effectiveFrom"<=CURRENT_TIMESTAMP AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP) AND ("workspaceId"=${workspaceId ?? null} OR "workspaceId" IS NULL) ORDER BY CASE WHEN "workspaceId"=${workspaceId ?? null} THEN 0 ELSE 1 END, "effectiveFrom" DESC LIMIT 1`)
  return rows[0]?.pointCost ?? null
}

export async function setPointPricing(input: { workspaceId?: string; action: string; pointCost: number; enabled: boolean; reason: string; createdById: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`UPDATE "PointPricingRule" SET "enabled"=FALSE,"effectiveTo"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "action"=${input.action} AND "workspaceId"=${input.workspaceId ?? null} AND "enabled"=TRUE`)
    const id = crypto.randomUUID()
    await tx.$executeRaw(Prisma.sql`INSERT INTO "PointPricingRule" ("id","workspaceId","action","pointCost","enabled","createdById","reason") VALUES (${id},${input.workspaceId ?? null},${input.action},${input.pointCost},${input.enabled},${input.createdById},${input.reason})`)
    return id
  })
}
