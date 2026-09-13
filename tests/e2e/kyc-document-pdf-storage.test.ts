import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { getTestAuth } from './auth-test'
import { getPrivateObject, storageExists, getPrivateObjectMetadata, deletePrivateObject } from '@/lib/storage'

const enabled = Boolean(process.env.E2E_BASE_URL)
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000'
let auth: Awaited<ReturnType<typeof getTestAuth>>
let customer: { id: string }
let otherUser: { id: string }
let admin: { id: string }
let workspaceA: { id: string }
let workspaceB: { id: string }
let templateId = ''
let renderedId = ''
let storageKeys: string[] = []

async function headersFor(userId: string) { return auth.getAuthHeaders({ userId }) }
async function requestAs(headers: Headers, path: string, init: RequestInit = {}) {
  const merged = new Headers(init.headers)
  for (const [key, value] of headers.entries()) merged.set(key, value)
  const response = await fetch(`${baseURL}${path}`, { ...init, headers: merged })
  return { response, body: await response.text() }
}
async function requestBinaryAs(headers: Headers, path: string) {
  const response = await fetch(`${baseURL}${path}`, { headers })
  return { response, bytes: new Uint8Array(await response.arrayBuffer()) }
}
async function expectDenied(headers: Headers, path: string, init: RequestInit = {}) {
  const result = await requestAs(headers, path, init)
  assert.ok([401, 403, 404].includes(result.response.status), `${init.method ?? 'GET'} ${path} returned ${result.response.status}`)
}

before(async () => {
  if (!enabled) return
  auth = await getTestAuth()
  const prefix = `acceptance-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  customer = await auth.saveUser(auth.createUser({ email: `${prefix}-customer@example.test`, name: 'Acceptance Customer', emailVerified: true }))
  otherUser = await auth.saveUser(auth.createUser({ email: `${prefix}-other@example.test`, name: 'Acceptance Other', emailVerified: true }))
  admin = await auth.saveUser(auth.createUser({ email: `${prefix}-admin@example.test`, name: 'Acceptance Admin', emailVerified: true, role: 'SUPER_ADMIN' }))
  workspaceA = await prisma.workspace.create({ data: { name: `${prefix} A`, slug: `${prefix}-a`, ownerId: customer.id, members: { create: [{ userId: customer.id, role: 'WORKSPACE_ADMIN' }] } } })
  workspaceB = await prisma.workspace.create({ data: { name: `${prefix} B`, slug: `${prefix}-b`, ownerId: otherUser.id, members: { create: [{ userId: otherUser.id, role: 'WORKSPACE_ADMIN' }] } } })
})

after(async () => {
  if (!enabled) return
  try {
    await Promise.all(storageKeys.map((key) => deletePrivateObject(key).catch(() => undefined)))
    await prisma.$executeRaw(Prisma.sql`DELETE FROM "KYCEvent" WHERE "kycId" IN (SELECT "id" FROM "KYCVerification" WHERE "userId"=${customer.id})`)
    await prisma.$executeRaw(Prisma.sql`DELETE FROM "KYCSubmission" WHERE "userId"=${customer.id}`)
    await prisma.kYCVerification.deleteMany({ where: { userId: customer.id } })
    if (renderedId) await prisma.$executeRaw(Prisma.sql`DELETE FROM "RenderedDocument" WHERE "id"=${renderedId}`)
    if (templateId) await prisma.$executeRaw(Prisma.sql`DELETE FROM "DocumentTemplateVersion" WHERE "templateId"=${templateId}`)
    if (templateId) await prisma.$executeRaw(Prisma.sql`DELETE FROM "DocumentTemplate" WHERE "id"=${templateId}`)
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } })
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } })
    await Promise.all([customer, otherUser, admin].map((u) => auth.deleteUser(u.id)))
  } finally {
    await prisma.$disconnect()
  }
})

test('unauthenticated KYC and document endpoints are denied', { skip: !enabled }, async () => {
  assert.equal((await fetch(`${baseURL}/api/kyc`)).status, 401)
  assert.equal((await fetch(`${baseURL}/api/workspaces/${workspaceA.id}/document-templates`)).status, 401)
})

test('customer KYC upload persists metadata, validates ownership, and supports manual review lifecycle', { skip: !enabled }, async () => {
  const customerHeaders = await headersFor(customer.id)
  const otherHeaders = await headersFor(otherUser.id)
  const adminHeaders = await headersFor(admin.id)
  const invalid = new FormData(); invalid.set('documentType', 'identity'); invalid.set('file', new File([new Uint8Array([1, 2, 3])], '../unsafe.exe', { type: 'application/octet-stream' }))
  assert.equal((await requestAs(customerHeaders, '/api/kyc/upload', { method: 'POST', body: invalid })).response.status, 400)
  const oversized = new FormData(); oversized.set('documentType', 'identity'); oversized.set('file', new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' }))
  assert.equal((await requestAs(customerHeaders, '/api/kyc/upload', { method: 'POST', body: oversized })).response.status, 400)
  const form = new FormData(); form.set('documentType', 'identity'); form.set('file', new File([new TextEncoder().encode('%PDF-1.4\nCloudie acceptance')], '../../passport final?.pdf', { type: 'application/pdf' }))
  const upload = await requestAs(customerHeaders, '/api/kyc/upload', { method: 'POST', body: form })
  assert.equal(upload.response.status, 201, upload.body)
  const uploaded = JSON.parse(upload.body) as { kycId: string; submissionId: string; storageKey: string; originalFilename: string; mimeType: string; sizeBytes: number }
  storageKeys.push(uploaded.storageKey)
  assert.equal(uploaded.mimeType, 'application/pdf'); assert.ok(uploaded.originalFilename.includes('passport_final_.pdf')); assert.ok(uploaded.storageKey.startsWith(`kyc/${customer.id}/`))
  assert.equal(await storageExists(uploaded.storageKey), true)
  assert.equal((await getPrivateObjectMetadata(uploaded.storageKey)).contentLength, String(uploaded.sizeBytes))
  assert.equal((await requestAs(customerHeaders, '/api/kyc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'submit', submissionId: uploaded.submissionId }) })).response.status, 201)
  await expectDenied(otherHeaders, `/api/admin/kyc/${uploaded.submissionId}/document`)
  assert.equal((await requestAs(otherHeaders, '/api/kyc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'review', userId: customer.id, status: 'APPROVED' }) })).response.status, 403)
  assert.equal((await requestAs(adminHeaders, '/api/kyc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'review', userId: customer.id, status: 'REJECTED' }) })).response.status, 400)
  const reject = await requestAs(adminHeaders, '/api/kyc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'review', userId: customer.id, status: 'REJECTED', reason: 'Document is unreadable' }) })
  assert.equal(reject.response.status, 200, reject.body)
  const adminDocument = await requestBinaryAs(adminHeaders, `/api/admin/kyc/${uploaded.submissionId}/document`)
  assert.equal(adminDocument.response.status, 200); assert.equal(adminDocument.response.headers.get('content-type'), 'application/pdf'); assert.equal(new TextDecoder().decode(adminDocument.bytes.slice(0, 5)), '%PDF-')
  const resubmitForm = new FormData(); resubmitForm.set('documentType', 'identity'); resubmitForm.set('file', new File([new TextEncoder().encode('%PDF-1.4\nCloudie resubmission')], 'resubmission.png', { type: 'image/png' }))
  const resubmitUpload = await requestAs(customerHeaders, '/api/kyc/upload', { method: 'POST', body: resubmitForm })
  assert.equal(resubmitUpload.response.status, 201, resubmitUpload.body)
  const resubmitted = JSON.parse(resubmitUpload.body) as { kycId: string; submissionId: string; storageKey: string }
  storageKeys.push(resubmitted.storageKey)
  assert.notEqual(resubmitted.kycId, uploaded.kycId)
  assert.equal((await requestAs(customerHeaders, '/api/kyc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'submit', submissionId: resubmitted.submissionId }) })).response.status, 201)
  const approve = await requestAs(adminHeaders, '/api/kyc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'review', userId: customer.id, status: 'VERIFIED' }) })
  assert.equal(approve.response.status, 200, approve.body)
  const kycEvents = await prisma.$queryRaw<Array<{ action: string; reason: string | null }>>(Prisma.sql`SELECT "action","reason" FROM "KYCEvent" WHERE "kycId" IN (SELECT "id" FROM "KYCVerification" WHERE "userId"=${customer.id}) ORDER BY "createdAt" ASC`)
  assert.ok(kycEvents.some((event) => event.action === 'REVIEW' && event.reason === 'Document is unreadable'))
})

test('real document template render produces a persisted PDF and is tenant-authorized', { skip: !enabled }, async () => {
  const ownerHeaders = await headersFor(customer.id)
  const foreignHeaders = await headersFor(otherUser.id)
  const template = await requestAs(ownerHeaders, `/api/workspaces/${workspaceA.id}/document-templates`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Acceptance Invoice', documentType: 'invoice', content: { title: 'Cloudie Acceptance', fields: { owner: customer.id, tenant: workspaceA.id, amount: '100.00' } } }) })
  assert.equal(template.response.status, 201, template.body); templateId = JSON.parse(template.body).templateId
  const render = (key: string) => requestAs(ownerHeaders, `/api/workspaces/${workspaceA.id}/document-templates/render`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ templateId, version: 1 }) })
  const key = `render-${crypto.randomUUID()}`
  const renders = await Promise.all(Array.from({ length: 8 }, () => render(key)))
  assert.ok(renders.every((result) => [200, 201].includes(result.response.status)))
  const payloads = renders.map((result) => JSON.parse(result.body) as { renderedDocument: { id: string; status: string; storageKey: string; metadata: { bytes: number } } })
  renderedId = payloads[0].renderedDocument.id; assert.equal(new Set(payloads.map((payload) => payload.renderedDocument.id)).size, 1); assert.ok(payloads[0].renderedDocument.metadata.bytes > 100)
  const stored = await getPrivateObject(payloads[0].renderedDocument.storageKey); const bytes = new Uint8Array(await stored.arrayBuffer()); assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-')
  const ownDownload = await requestBinaryAs(ownerHeaders, `/api/workspaces/${workspaceA.id}/document-templates/render/${renderedId}`); assert.equal(ownDownload.response.status, 200); assert.equal(new TextDecoder().decode(ownDownload.bytes.slice(0, 5)), '%PDF-')
  const foreignDownload = await requestAs(foreignHeaders, `/api/workspaces/${workspaceA.id}/document-templates/render/${renderedId}`); assert.ok([401, 403, 404].includes(foreignDownload.response.status))
  const foreignWorkspaceDownload = await requestAs(foreignHeaders, `/api/workspaces/${workspaceB.id}/document-templates/render/${renderedId}`); assert.ok([401, 403, 404].includes(foreignWorkspaceDownload.response.status))
})
