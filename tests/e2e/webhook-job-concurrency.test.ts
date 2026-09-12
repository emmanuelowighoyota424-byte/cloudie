import test from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'

test('concurrent CloudieJob claims have one winner', async () => {
  const jobId = crypto.randomUUID()
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "CloudieJob" ("id","type","payload","runAt") VALUES (${jobId},'test',${JSON.stringify({})}::jsonb,CURRENT_TIMESTAMP)`)
  const claim = () => prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`UPDATE "CloudieJob" SET "status"='PROCESSING',"startedAt"=CURRENT_TIMESTAMP,"attempts"="attempts"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id" IN (SELECT "id" FROM "CloudieJob" WHERE "status" IN ('PENDING','RETRY') AND "runAt"<=CURRENT_TIMESTAMP ORDER BY "runAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING "id"`)
  const results = await Promise.all(Array.from({ length: 12 }, claim))
  assert.equal(results.filter((result) => result.some((row) => row.id === jobId)).length, 1)
  const job = await prisma.$queryRaw<Array<{ status: string; attempts: number }>>(Prisma.sql`SELECT "status","attempts" FROM "CloudieJob" WHERE "id"=${jobId}`)
  assert.equal(job[0]?.status, 'PROCESSING')
  assert.equal(job[0]?.attempts, 1)
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "CloudieJob" WHERE "id"=${jobId}`)
})

test('concurrent webhook deliveries have one processing winner', async () => {
  const eventId = `test-${crypto.randomUUID()}`
  const webhook = await prisma.webhookEvent.create({ data: { provider: 'test', eventId, payload: { event: 'charge.success' } } })
  const claim = () => prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`UPDATE "WebhookEvent" SET "processingAt"=CURRENT_TIMESTAMP WHERE "id"=${webhook.id} AND "processedAt" IS NULL AND ("processingAt" IS NULL OR "processingAt" < CURRENT_TIMESTAMP - INTERVAL '10 minutes') RETURNING "id"`)
  const results = await Promise.all(Array.from({ length: 12 }, claim))
  assert.equal(results.filter((result) => result.length === 1).length, 1)
  await prisma.webhookEvent.delete({ where: { id: webhook.id } })
})
