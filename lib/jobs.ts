import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

export async function enqueueJob(type: string, payload: unknown, options: { workspaceId?: string; idempotencyKey?: string; runAt?: Date } = {}) {
  const id = crypto.randomUUID()
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`INSERT INTO "CloudieJob" ("id","type","workspaceId","payload","runAt","idempotencyKey") VALUES (${id},${type},${options.workspaceId ?? null},${JSON.stringify(payload)}::jsonb,${options.runAt ?? new Date()},${options.idempotencyKey ?? null}) ON CONFLICT ("idempotencyKey") DO UPDATE SET "id"="CloudieJob"."id" RETURNING "id"`)
  return rows[0].id
}

export async function enqueueEmail(input: { to: string; subject: string; template: string; payload: Record<string, unknown>; workspaceId?: string; userId?: string; idempotencyKey?: string }) {
  const emailId = crypto.randomUUID()
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "EmailMessage" ("id","workspaceId","userId","recipient","subject","template","payload") VALUES (${emailId},${input.workspaceId ?? null},${input.userId ?? null},${input.to},${input.subject},${input.template},${JSON.stringify(input.payload)}::jsonb)`)
  await enqueueJob('email.send', { emailId }, { workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey ?? `email:${emailId}` })
  return emailId
}

export async function processDueJobs(limit = 10) {
  const jobs = await prisma.$queryRaw<Array<{ id: string; type: string; payload: { emailId?: string; campaignId?: string }; attempts: number; maxAttempts: number }>>(Prisma.sql`UPDATE "CloudieJob" SET "status"='PROCESSING',"startedAt"=CURRENT_TIMESTAMP,"attempts"="attempts"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id" IN (SELECT "id" FROM "CloudieJob" WHERE "status" IN ('PENDING','RETRY') AND "runAt"<=CURRENT_TIMESTAMP ORDER BY "runAt" ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED) RETURNING *`)
  let processed = 0
  for (const job of jobs) {
    try {
      if (job.type === 'email.send' && job.payload.emailId) {
        const rows = await prisma.$queryRaw<Array<{ id: string; recipient: string; subject: string; payload: Record<string, unknown>; status: string }>>(Prisma.sql`SELECT "id","recipient","subject","payload","status" FROM "EmailMessage" WHERE "id"=${job.payload.emailId} LIMIT 1`)
        const email = rows[0]
        if (!email || email.status === 'SENT') throw new Error('Email job target not found or already sent')
        const html = typeof email.payload.html === 'string' ? email.payload.html : `<p>${String(email.payload.text ?? '')}</p>`
        const text = typeof email.payload.text === 'string' ? email.payload.text : String(email.payload.message ?? '')
        await sendEmail({ to: email.recipient, subject: email.subject, html, text })
        await prisma.$executeRaw(Prisma.sql`UPDATE "EmailMessage" SET "status"='SENT',"sentAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${email.id}`)
      } else if (job.type === 'campaign.send' && job.payload.campaignId) {
        const rows = await prisma.$queryRaw<Array<{ id: string; workspaceId: string; subject: string; template: string; audience: string[]; status: string }>>(Prisma.sql`SELECT "id","workspaceId","subject","template","audience","status" FROM "EmailCampaign" WHERE "id"=${job.payload.campaignId} LIMIT 1`)
        const campaign = rows[0]
        if (!campaign || ['SENT','CANCELLED'].includes(campaign.status)) throw new Error('Campaign is unavailable')
        await prisma.$executeRaw(Prisma.sql`UPDATE "EmailCampaign" SET "status"='PROCESSING',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${campaign.id}`)
        let failed = 0
        for (const recipient of campaign.audience) {
          try {
            await enqueueEmail({ to: recipient, subject: campaign.subject, template: campaign.template, payload: { text: campaign.template }, workspaceId: campaign.workspaceId, idempotencyKey: `campaign-email:${campaign.id}:${recipient}` })
          } catch { failed++ }
        }
        await prisma.$executeRaw(Prisma.sql`UPDATE "EmailCampaign" SET "status"='SENT',"sentCount"="sentCount"+${campaign.audience.length - failed},"failedCount"="failedCount"+${failed},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${campaign.id}`)
      } else {
        throw new Error(`Unsupported job type: ${job.type}`)
      }
      await prisma.$executeRaw(Prisma.sql`UPDATE "CloudieJob" SET "status"='COMPLETED',"finishedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id}`)
      processed++
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Job failed'
      const retry = job.attempts < job.maxAttempts
      await prisma.$executeRaw(Prisma.sql`UPDATE "CloudieJob" SET "status"=${retry ? 'RETRY' : 'FAILED'},"lastError"=${message.slice(0,1000)},"runAt"=CURRENT_TIMESTAMP + (${Math.min(300, 2 ** job.attempts)} * INTERVAL '1 second'),"finishedAt"=CASE WHEN ${retry} THEN "finishedAt" ELSE CURRENT_TIMESTAMP END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.id}`)
      if (job.type === 'email.send' && job.payload.emailId) await prisma.$executeRaw(Prisma.sql`UPDATE "EmailMessage" SET "status"=${retry ? 'QUEUED' : 'FAILED'},"attempts"="attempts"+1,"lastError"=${message.slice(0,1000)},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${job.payload.emailId}`)
    }
  }
  return { processed, claimed: jobs.length }
}
