import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { debitPoints } from '@/lib/points'

export async function getActionPrice(input: { workspaceId: string; action: string; quantity?: number }) {
  const quantity = input.quantity ?? 1
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Invalid billing quantity')
  const rows = await prisma.$queryRaw<Array<{ pointCost: number }>>(Prisma.sql`SELECT "pointCost" FROM "PointPricingRule" WHERE "action"=${input.action} AND "enabled"=TRUE AND ("workspaceId"=${input.workspaceId} OR "workspaceId" IS NULL) AND "effectiveFrom"<=CURRENT_TIMESTAMP AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP) ORDER BY CASE WHEN "workspaceId"=${input.workspaceId} THEN 0 ELSE 1 END,"effectiveFrom" DESC LIMIT 1`)
  if (!rows[0]) throw new Error(`No active pricing rule for ${input.action}`)
  const unitCost = Number(rows[0].pointCost)
  if (!Number.isSafeInteger(unitCost) || unitCost < 0) throw new Error('Invalid pricing configuration')
  const amount = unitCost * quantity
  if (!Number.isSafeInteger(amount)) throw new Error('Billing amount exceeds supported range')
  return { unitCost, quantity, amount }
}

export async function chargeForAction(input:{userId:string;workspaceId:string;action:string;description:string;reference:string;quantity?:number}) {
  const price = await getActionPrice(input)
  if (price.amount === 0) return { ...price, idempotent:false }
  const result = await debitPoints({ userId:input.userId, amount:price.amount, description:input.description, reference:`${input.reference}:workspace:${input.workspaceId}`, workspace:input.workspaceId })
  return { ...price, idempotent:result.idempotent }
}
