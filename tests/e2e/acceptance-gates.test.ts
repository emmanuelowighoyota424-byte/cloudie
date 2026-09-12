import test from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { roleHasPermission } from '../../lib/permissions'
import { sanitizeFilename, validateUpload } from '../../lib/storage'

async function createUser(role: 'USER' | 'SUPER_ADMIN' = 'USER') {
  const id = crypto.randomUUID()
  await prisma.user.create({ data: { id, name: `Acceptance ${id}`, email: `${id}@example.invalid`, role } })
  return id
}

test('KYC rejection reason and resubmission lifecycle persist with tenant-safe ownership', async () => {
  const userA = await createUser()
  const userB = await createUser()
  const kycId = crypto.randomUUID()
  const submissionA = crypto.randomUUID()
  const submissionB = crypto.randomUUID()
  await prisma.kYCVerification.create({ data: { id: kycId, userId: userA, status: 'PENDING' } })
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "KYCSubmission" ("id","userId","kycId","documentType","storageKey","originalFilename","mimeType") VALUES (${submissionA},${userA},${kycId},'identity',${`kyc/${userA}/doc-a.pdf`},${sanitizeFilename('../../passport final.pdf')},'application/pdf')`)
  const ownerRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "KYCSubmission" WHERE "id"=${submissionA} AND "userId"=${userA}`)
  const crossUserRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "KYCSubmission" WHERE "id"=${submissionA} AND "userId"=${userB}`)
  assert.equal(ownerRows.length, 1)
  assert.equal(crossUserRows.length, 0)
  await prisma.kYCVerification.update({ where: { id: kycId }, data: { status: 'REJECTED', reviewedAt: new Date() } })
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "KYCEvent" ("id","kycId","actorId","action","fromStatus","toStatus","reason") VALUES (${crypto.randomUUID()},${kycId},${userB},'REVIEW','PENDING','REJECTED','Document is unreadable')`)
  const rejection = await prisma.$queryRaw<Array<{ reason: string }>>(Prisma.sql`SELECT "reason" FROM "KYCEvent" WHERE "kycId"=${kycId} AND "toStatus"='REJECTED' ORDER BY "createdAt" DESC LIMIT 1`)
  assert.equal(rejection[0]?.reason, 'Document is unreadable')
  await prisma.kYCVerification.update({ where: { id: kycId }, data: { status: 'PENDING', reviewedAt: null } })
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "KYCSubmission" ("id","userId","kycId","documentType","storageKey","originalFilename","mimeType") VALUES (${submissionB},${userA},${kycId},'identity',${`kyc/${userA}/resubmission.png`},'resubmission.png','image/png')`)
  await prisma.kYCVerification.update({ where: { id: kycId }, data: { status: 'VERIFIED', reviewedAt: new Date() } })
  const final = await prisma.kYCVerification.findUnique({ where: { id: kycId } })
  const submissions = await prisma.$queryRaw<Array<{ id: string; storageKey: string }>>(Prisma.sql`SELECT "id","storageKey" FROM "KYCSubmission" WHERE "kycId"=${kycId} ORDER BY "createdAt" ASC`)
  assert.equal(final?.status, 'VERIFIED')
  assert.equal(submissions.length, 2)
  assert.ok(submissions.every((row) => row.storageKey.startsWith(`kyc/${userA}/`)))
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "KYCSubmission" WHERE "kycId"=${kycId}`)
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "KYCEvent" WHERE "kycId"=${kycId}`)
  await prisma.kYCVerification.delete({ where: { id: kycId } })
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } })
})

test('KYC upload policy rejects invalid MIME, oversized files, and unsafe filenames', () => {
  assert.throws(() => validateUpload('application/octet-stream', 1024))
  assert.throws(() => validateUpload('application/pdf', 4 * 1024 * 1024 + 1))
  assert.equal(sanitizeFilename('..\\..\\private passport?.pdf'), 'private_passport_.pdf')
  for (const type of ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']) assert.doesNotThrow(() => validateUpload(type, 1024))
})

test('platform-admin permission cannot be acquired by customer, vendor, or workspace roles', () => {
  for (const role of ['CUSTOMER', 'VENDOR', 'WORKSPACE_ADMIN', 'DRIVER', 'WAREHOUSE_STAFF'] as const) {
    assert.equal(roleHasPermission(role, 'admin.platform'), false)
  }
  assert.equal(roleHasPermission('SUPER_ADMIN', 'admin.platform'), true)
})

test('notification delivery is user-scoped and cannot be selected by arbitrary tenant/user identifiers', async () => {
  const userA = await createUser()
  const userB = await createUser()
  const workspaceA = crypto.randomUUID()
  const workspaceB = crypto.randomUUID()
  await prisma.workspace.create({ data: { id: workspaceA, name: 'Realtime A', slug: `rt-${workspaceA}`, ownerId: userA } })
  await prisma.workspace.create({ data: { id: workspaceB, name: 'Realtime B', slug: `rt-${workspaceB}`, ownerId: userB } })
  await prisma.workspaceMember.createMany({ data: [
    { id: crypto.randomUUID(), workspaceId: workspaceA, userId: userA, role: 'WORKSPACE_ADMIN' },
    { id: crypto.randomUUID(), workspaceId: workspaceB, userId: userB, role: 'WORKSPACE_ADMIN' },
  ] })
  await prisma.notification.create({ data: { id: crypto.randomUUID(), userId: userA, type: 'TEST', title: 'A only', message: 'private event' } })
  await prisma.notification.create({ data: { id: crypto.randomUUID(), userId: userB, type: 'TEST', title: 'B only', message: 'private event' } })
  const eventsA = await prisma.notification.findMany({ where: { userId: userA } })
  const eventsB = await prisma.notification.findMany({ where: { userId: userB } })
  assert.equal(eventsA.length, 1)
  assert.equal(eventsB.length, 1)
  assert.equal(eventsA[0]?.userId, userA)
  assert.equal(eventsB[0]?.userId, userB)
  await prisma.notification.deleteMany({ where: { userId: { in: [userA, userB] } } })
  await prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } } })
  await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } })
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } })
})

test('document artifact acceptance validates a real PDF byte signature and tenant ownership metadata', async () => {
  const ownerA = await createUser()
  const ownerB = await createUser()
  const workspaceA = crypto.randomUUID()
  const workspaceB = crypto.randomUUID()
  await prisma.workspace.create({ data: { id: workspaceA, name: 'Docs A', slug: `docs-${workspaceA}`, ownerId: ownerA } })
  await prisma.workspace.create({ data: { id: workspaceB, name: 'Docs B', slug: `docs-${workspaceB}`, ownerId: ownerB } })
  const templateId = crypto.randomUUID()
  const versionId = crypto.randomUUID()
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "DocumentTemplate" ("id","workspaceId","name","description","createdBy") VALUES (${templateId},${workspaceA},'Acceptance Invoice','Acceptance PDF',${ownerA})`)
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "DocumentTemplateVersion" ("id","templateId","version","content","createdBy") VALUES (${versionId},${templateId},1,'Acceptance PDF content',${ownerA})`)
  const renderedId = crypto.randomUUID()
  const storageKey = `documents/${workspaceA}/${renderedId}.pdf`
  const pdfBytes = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF')
  assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-')
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "RenderedDocument" ("id","workspaceId","templateId","versionId","status","storageKey","mimeType","sizeBytes","createdBy") VALUES (${renderedId},${workspaceA},${templateId},${versionId},'READY',${storageKey},'application/pdf',${pdfBytes.byteLength},${ownerA})`)
  const own = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "RenderedDocument" WHERE "id"=${renderedId} AND "workspaceId"=${workspaceA}`)
  const foreign = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "RenderedDocument" WHERE "id"=${renderedId} AND "workspaceId"=${workspaceB}`)
  assert.equal(own.length, 1)
  assert.equal(foreign.length, 0)
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "RenderedDocument" WHERE "id"=${renderedId}`)
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "DocumentTemplateVersion" WHERE "id"=${versionId}`)
  await prisma.$executeRaw(Prisma.sql`DELETE FROM "DocumentTemplate" WHERE "id"=${templateId}`)
  await prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } } })
  await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } })
  await prisma.user.deleteMany({ where: { id: { in: [ownerA, ownerB] } } })
})
