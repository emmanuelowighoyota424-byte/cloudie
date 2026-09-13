import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { prisma } from '@/lib/prisma'
import { getTestAuth } from './auth-test'

const enabled = Boolean(process.env.E2E_BASE_URL)
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000'
let testAuth: Awaited<ReturnType<typeof getTestAuth>>
let users: Array<{ id: string }>
let workspaceA: { id: string }
let workspaceB: { id: string }
let vendorB: { id: string }
let productB: { id: string }
let customerB: { id: string }
let departmentB: string
let assetA: string | null = null

async function requestAs(headers: Headers, path: string, init: RequestInit = {}) {
  const headersOut = new Headers(init.headers)
  for (const [key, value] of headers.entries()) headersOut.set(key, value)
  const response = await fetch(`${baseURL}${path}`, { ...init, headers: headersOut })
  const body = await response.text()
  return { response, body }
}

async function expectDenied(headers: Headers, path: string, init: RequestInit = {}) {
  const { response } = await requestAs(headers, path, init)
  assert.ok([401, 403, 404].includes(response.status), `${init.method ?? 'GET'} ${path} unexpectedly returned ${response.status}`)
}

before(async () => {
  if (!enabled) return
  testAuth = await getTestAuth()
  const prefix = `cloudie-feature-e2e-${Date.now()}`
  const names = ['admin-a', 'admin-b', 'customer-a', 'customer-b', 'staff-a']
  users = (await Promise.all(names.map(async (name) => {
    const created = testAuth.createUser({ email: `${prefix}-${name}@example.test`, name: `Feature E2E ${name}`, emailVerified: true })
    const saved = await testAuth.saveUser(created)
    return { id: saved.id }
  })))

  workspaceA = await prisma.workspace.create({
    data: {
      name: `${prefix} A`, slug: `${prefix}-a`, ownerId: users[0].id,
      members: { create: [
        { userId: users[0].id, role: 'WORKSPACE_ADMIN' },
        { userId: users[2].id, role: 'CUSTOMER' },
        { userId: users[4].id, role: 'STAFF' },
      ] },
      subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
    },
  })
  workspaceB = await prisma.workspace.create({
    data: {
      name: `${prefix} B`, slug: `${prefix}-b`, ownerId: users[1].id,
      members: { create: [
        { userId: users[1].id, role: 'WORKSPACE_ADMIN' },
        { userId: users[3].id, role: 'CUSTOMER' },
      ] },
      subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
    },
  })

  customerB = await prisma.customer.create({ data: { workspaceId: workspaceB.id, name: 'Feature Customer B', email: `${prefix}-customer-b@example.test` } })
  vendorB = await prisma.vendor.create({ data: { workspaceId: workspaceB.id, name: 'Feature Vendor B', category: 'electronics', status: 'APPROVED' } })
  productB = await prisma.product.create({ data: { workspaceId: workspaceB.id, vendorId: vendorB.id, name: 'Private Product B', sku: `${prefix}-B`, price: 25, stock: 10, active: true } })
  departmentB = crypto.randomUUID()
  await prisma.$executeRaw`INSERT INTO "BusinessDepartment" ("id","workspaceId","name") VALUES (${departmentB},${workspaceB.id},${'Private Department B'})`
})

after(async () => {
  if (!enabled || !workspaceA || !workspaceB) return
  if (assetA) await prisma.$executeRaw`DELETE FROM "CloudieAsset" WHERE "id"=${assetA}`
  await prisma.$executeRaw`DELETE FROM "BusinessInvoice" WHERE "workspaceId" IN (${workspaceA.id},${workspaceB.id})`
  await prisma.$executeRaw`DELETE FROM "BusinessStaff" WHERE "workspaceId" IN (${workspaceA.id},${workspaceB.id})`
  await prisma.$executeRaw`DELETE FROM "BusinessDepartment" WHERE "workspaceId" IN (${workspaceA.id},${workspaceB.id})`
  await prisma.orderItem.deleteMany({ where: { order: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } } })
  await prisma.payment.deleteMany({ where: { order: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } } })
  await prisma.order.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } })
  await prisma.product.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } })
  await prisma.vendor.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } })
  await prisma.customer.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } })
  await prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } })
  await prisma.subscription.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } })
  await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } })
  await Promise.all(users.map((user) => testAuth.deleteUser(user.id)))
  await prisma.$disconnect()
  await fs.rm(process.env.CLOUDIE_STORAGE_ROOT ?? '/tmp/cloudie-e2e-storage', { recursive: true, force: true })
})

test('marketplace is tenant-isolated and validates vendor ownership', { skip: !enabled }, async () => {
  const adminA = await testAuth.getAuthHeaders({ userId: users[0].id })
  const list = await requestAs(adminA, `/api/workspaces/${workspaceA.id}/marketplace`)
  assert.equal(list.response.status, 200)
  assert.doesNotMatch(list.body, new RegExp(productB.id))
  assert.doesNotMatch(list.body, /Private Product B/)

  const foreignVendorProduct = await requestAs(adminA, `/api/workspaces/${workspaceA.id}/marketplace`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'product', name: 'Should Fail', sku: `foreign-${Date.now()}`, price: 1, stock: 1, vendorId: vendorB.id }),
  })
  assert.equal(foreignVendorProduct.response.status, 404)

  const validVendor = await requestAs(adminA, `/api/workspaces/${workspaceA.id}/marketplace`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'vendor', name: 'Workspace A Vendor', category: 'software' }),
  })
  assert.equal(validVendor.response.status, 201)
  const vendor = JSON.parse(validVendor.body).vendor
  const validProduct = await requestAs(adminA, `/api/workspaces/${workspaceA.id}/marketplace`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'product', name: 'Workspace A Product', sku: `A-${Date.now()}`, price: 10, stock: 3, vendorId: vendor.id }),
  })
  assert.equal(validProduct.response.status, 201)
})

test('orders enforce workspace product ownership and preserve idempotency', { skip: !enabled }, async () => {
  const adminA = await testAuth.getAuthHeaders({ userId: users[0].id })
  const key = `order-${Date.now()}`
  const foreign = await requestAs(adminA, `/api/workspaces/${workspaceA.id}/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify({ items: [{ productId: productB.id, quantity: 1 }] }),
  })
  assert.equal(foreign.response.status, 400)

  const ownProduct = await prisma.product.create({ data: { workspaceId: workspaceA.id, name: 'Order Product A', sku: `ORDER-A-${Date.now()}`, price: 12, stock: 2, active: true } })
  const created = await requestAs(adminA, `/api/workspaces/${workspaceA.id}/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify({ items: [{ productId: ownProduct.id, quantity: 1 }] }),
  })
  assert.equal(created.response.status, 201)
  const reused = await requestAs(adminA, `/api/workspaces/${workspaceA.id}/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify({ items: [{ productId: ownProduct.id, quantity: 1 }] }),
  })
  assert.equal(reused.response.status, 200)
  assert.equal(JSON.parse(reused.body).reused, true)
  const after = await prisma.product.findUnique({ where: { id: ownProduct.id }, select: { stock: true } })
  assert.equal(after?.stock, 1)
})

test('business suite scopes customers and departments to the active workspace', { skip: !enabled }, async () => {
  const adminA = await testAuth.getAuthHeaders({ userId: users[0].id })
  const getA = await requestAs(adminA, `/api/workspaces/${workspaceA.id}/business`)
  assert.equal(getA.response.status, 200)
  assert.doesNotMatch(getA.body, new RegExp(customerB.id))
  assert.doesNotMatch(getA.body, new RegExp(departmentB))

  const foreignInvoice = await requestAs(adminA, `/api/workspaces/${workspaceA.id}/business`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'invoice', number: `INV-${Date.now()}`, customerId: customerB.id, items: [{ name: 'Private' }], subtotal: 100, tax: 0 }),
  })
  assert.equal(foreignInvoice.response.status, 404)

  const foreignStaff = await requestAs(adminA, `/api/workspaces/${workspaceA.id}/business`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'staff', userId: users[0].id, role: 'STAFF', departmentId: departmentB }),
  })
  assert.equal(foreignStaff.response.status, 404)

  const ownDepartment = await requestAs(adminA, `/api/workspaces/${workspaceA.id}/business`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'department', name: 'Operations A' }),
  })
  assert.equal(ownDepartment.response.status, 201)
  const departmentId = JSON.parse(ownDepartment.body).id
  const ownStaff = await requestAs(adminA, `/api/workspaces/${workspaceA.id}/business`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'staff', userId: users[0].id, role: 'STAFF', departmentId }),
  })
  assert.equal(ownStaff.response.status, 201)
})

test('analytics is super-admin-only and returns scoped aggregate data', { skip: !enabled }, async () => {
  const workspaceAdmin = await testAuth.getAuthHeaders({ userId: users[0].id })
  const denied = await requestAs(workspaceAdmin, '/api/admin/analytics?days=7')
  assert.equal(denied.response.status, 403)

  await prisma.user.update({ where: { id: users[0].id }, data: { role: 'SUPER_ADMIN' } })
  const superAdmin = await testAuth.getAuthHeaders({ userId: users[0].id })
  const allowed = await requestAs(superAdmin, '/api/admin/analytics?days=7')
  assert.equal(allowed.response.status, 200)
  const body = JSON.parse(allowed.body)
  assert.equal(body.period.days, 7)
  assert.ok(typeof body.revenue === 'string')
  assert.ok(Number.isInteger(body.orders))
  await prisma.user.update({ where: { id: users[0].id }, data: { role: 'USER' } })
})

test('image studio asset flow stores images privately and enforces tenant ownership', { skip: !enabled }, async () => {
  const adminA = await testAuth.getAuthHeaders({ userId: users[0].id })
  const form = new FormData()
  form.set('file', new File([Buffer.from('fake-png-content')], '../../private-image.png', { type: 'image/png' }))
  const uploaded = await requestAs(adminA, `/api/workspaces/${workspaceA.id}/assets`, { method: 'POST', body: form })
  assert.equal(uploaded.response.status, 201)
  const payload = JSON.parse(uploaded.body)
  assetA = payload.id
  assert.equal(payload.filename, 'private-image.png')
  assert.equal(payload.mimeType, 'image/png')

  const listA = await requestAs(adminA, `/api/workspaces/${workspaceA.id}/assets`)
  assert.equal(listA.response.status, 200)
  assert.match(listA.body, new RegExp(assetA!))

  const adminB = await testAuth.getAuthHeaders({ userId: users[1].id })
  await expectDenied(adminB, `/api/workspaces/${workspaceB.id}/assets/${assetA}`)
  const foreignDelete = await requestAs(adminB, `/api/workspaces/${workspaceB.id}/assets`, {
    method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: assetA }),
  })
  assert.equal(foreignDelete.response.status, 404)

  const deleted = await requestAs(adminA, `/api/workspaces/${workspaceA.id}/assets`, {
    method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: assetA }),
  })
  assert.equal(deleted.response.status, 200)
  assetA = null
})
