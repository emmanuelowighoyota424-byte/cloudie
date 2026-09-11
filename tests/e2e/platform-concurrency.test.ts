import test from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'

test('durable job enqueue is idempotent under concurrent callers', async () => {
  const key = `test-job-${crypto.randomUUID()}`
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`INSERT INTO "CloudieJob" ("id","type","payload","runAt","idempotencyKey") VALUES (${crypto.randomUUID()},'test',${JSON.stringify({ index })}::jsonb,CURRENT_TIMESTAMP,${key}) ON CONFLICT ("idempotencyKey") DO UPDATE SET "id"="CloudieJob"."id" RETURNING "id"`)))
  const ids = results.map((r) => r[0]?.id).filter(Boolean)
  assert.equal(new Set(ids).size, 1)
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "CloudieJob" WHERE "idempotencyKey"=${key}`)
})

test('rendered-document idempotency permits only one concurrent record', async () => {
  const workspaceId = crypto.randomUUID()
  const ownerId = crypto.randomUUID()
  const key = `render-${crypto.randomUUID()}`
  const results = await Promise.all(Array.from({ length: 8 }, () => prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`INSERT INTO "RenderedDocument" ("id","workspaceId","ownerId","status","idempotencyKey") VALUES (${crypto.randomUUID()},${workspaceId},${ownerId},'PROCESSING',${key}) ON CONFLICT DO NOTHING RETURNING "id"`)))
  assert.equal(results.filter((r) => r.length === 1).length, 1)
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "RenderedDocument" WHERE "workspaceId"=${workspaceId}`)
})

test('dispute active-state duplicate protection holds under concurrent creation', async () => {
  const workspaceId = crypto.randomUUID()
  const orderId = crypto.randomUUID()
  const openedById = crypto.randomUUID()
  const insert = () => prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`INSERT INTO "MarketplaceDispute" ("id","workspaceId","orderId","openedById","reason","description") VALUES (${crypto.randomUUID()},${workspaceId},${orderId},${openedById},'TEST','concurrency test') ON CONFLICT ("orderId","openedById") WHERE "status" IN ('OPEN','UNDER_REVIEW','AWAITING_VENDOR','AWAITING_CUSTOMER') DO NOTHING RETURNING "id"`)
  const results = await Promise.all(Array.from({ length: 8 }, insert))
  assert.equal(results.filter((r) => r.length === 1).length, 1)
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "MarketplaceDispute" WHERE "workspaceId"=${workspaceId}`)
})

test('KYC review state transition allows exactly one concurrent winner', async () => {
  const userId = crypto.randomUUID()
  const kycId = crypto.randomUUID()
  await prisma.user.create({ data: { id: userId, name: 'Concurrency Test', email: `${userId}@example.invalid` } })
  await prisma.kYCVerification.create({ data: { id: kycId, userId, status: 'UNDER_REVIEW' } })
  const results = await Promise.all(Array.from({ length: 8 }, () => prisma.kYCVerification.updateMany({ where: { id: kycId, status: 'UNDER_REVIEW' }, data: { status: 'VERIFIED', reviewedAt: new Date() } })))
  assert.equal(results.filter((r) => r.count === 1).length, 1)
  await prisma.kYCVerification.delete({ where: { id: kycId } })
  await prisma.user.delete({ where: { id: userId } })
})
