import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireSuperAdmin, requireUser } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

const statuses = ['NOT_STARTED','PENDING','UNDER_REVIEW','VERIFIED','REJECTED']

export async function GET() {
  try {
    const user = await requireUser()
    const kyc = await prisma.kYCVerification.findFirst({ where: { userId: user.id }, orderBy: { submittedAt: 'desc' } })
    const submissions = kyc ? await prisma.$queryRaw(Prisma.sql`SELECT "id","documentType","originalFilename","mimeType","status","createdAt","updatedAt" FROM "KYCSubmission" WHERE "userId"=${user.id} AND "kycId"=${kyc.id} ORDER BY "createdAt" DESC`) : []
    return NextResponse.json({ kyc, submissions })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load KYC'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const action = typeof body?.action === 'string' ? body.action : 'submit'
    if (action === 'review') {
      await requireSuperAdmin()
      const userId = typeof body?.userId === 'string' ? body.userId : ''
      const status = typeof body?.status === 'string' ? body.status : ''
      const reason = typeof body?.reason === 'string' ? body.reason.trim() : null
      if (!userId || !statuses.includes(status) || (status === 'REJECTED' && !reason)) return NextResponse.json({ error: 'Valid userId/status required; rejection requires reason' }, { status: 400 })
      const current = await prisma.kYCVerification.findFirst({ where: { userId }, orderBy: { submittedAt: 'desc' } })
      if (!current) return NextResponse.json({ error: 'KYC record not found' }, { status: 404 })
      const updated = await prisma.kYCVerification.update({ where: { id: current.id }, data: { status, reviewedAt: new Date() } })
      await prisma.$executeRaw(Prisma.sql`INSERT INTO "KYCEvent" ("id","kycId","actorId","action","fromStatus","toStatus","reason") VALUES (${crypto.randomUUID()},${current.id},${user.id},'REVIEW',${current.status},${status},${reason})`)
      await prisma.auditLog.create({ data: { actorId: user.id, userId, action: 'kyc.reviewed', entity: 'KYCVerification', entityId: current.id, metadata: { from: current.status, to: status, reason } } })
      return NextResponse.json({ kyc: updated })
    }
    if (action === 'submit') {
      const documentType = typeof body?.documentType === 'string' ? body.documentType.trim() : ''
      const storageKey = typeof body?.storageKey === 'string' ? body.storageKey.trim() : ''
      const originalFilename = typeof body?.originalFilename === 'string' ? body.originalFilename.trim() : ''
      const mimeType = typeof body?.mimeType === 'string' ? body.mimeType.trim() : ''
      if (!documentType || !storageKey || !originalFilename || !mimeType) return NextResponse.json({ error: 'documentType, storageKey, originalFilename and mimeType are required' }, { status: 400 })
      if (!storageKey.startsWith(`kyc/${user.id}/`)) return NextResponse.json({ error: 'Invalid KYC storage ownership' }, { status: 403 })
      let kyc = await prisma.kYCVerification.findFirst({ where: { userId: user.id }, orderBy: { submittedAt: 'desc' } })
      if (!kyc || ['REJECTED','NOT_STARTED'].includes(kyc.status)) kyc = await prisma.kYCVerification.create({ data: { userId: user.id, status: 'PENDING' } })
      else if (kyc.status === 'VERIFIED') return NextResponse.json({ error: 'KYC is already verified' }, { status: 409 })
      else kyc = await prisma.kYCVerification.update({ where: { id: kyc.id }, data: { status: 'PENDING', reviewedAt: null } })
      const id = crypto.randomUUID()
      await prisma.$executeRaw(Prisma.sql`INSERT INTO "KYCSubmission" ("id","userId","kycId","documentType","storageKey","originalFilename","mimeType") VALUES (${id},${user.id},${kyc.id},${documentType},${storageKey},${originalFilename},${mimeType})`)
      await prisma.$executeRaw(Prisma.sql`INSERT INTO "KYCEvent" ("id","kycId","actorId","action","fromStatus","toStatus") VALUES (${crypto.randomUUID()},${kyc.id},${user.id},'SUBMIT',NULL,'PENDING')`)
      return NextResponse.json({ kyc, submissionId: id }, { status: 201 })
    }
    return NextResponse.json({ error: 'Unsupported KYC action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process KYC'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 400 })
  }
}
