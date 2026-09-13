import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../../lib/prisma'
import { getTestAuth } from './auth-test'

const enabled = Boolean(process.env.E2E_BASE_URL)
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000'
let auth: Awaited<ReturnType<typeof getTestAuth>>
let customer: { id: string }
let admin: { id: string }

async function request(headers: Headers, path: string, init: RequestInit = {}) {
  const merged = new Headers(init.headers)
  for (const [key, value] of headers.entries()) merged.set(key, value)
  const response = await fetch(`${baseURL}${path}`, { ...init, headers: merged })
  return response.status
}

before(async () => {
  if (!enabled) return
  auth = await getTestAuth()
  const prefix = `admin-auth-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  customer = await auth.saveUser(auth.createUser({ email: `${prefix}-customer@example.test`, name: 'Admin Matrix Customer', emailVerified: true }))
  admin = await auth.saveUser(auth.createUser({ email: `${prefix}-admin@example.test`, name: 'Admin Matrix Admin', emailVerified: true, role: 'SUPER_ADMIN' }))
})

after(async () => {
  if (!enabled) return
  try {
    await prisma.user.deleteMany({ where: { id: { in: [customer.id, admin.id] } } })
    await Promise.all([customer, admin].map((u) => auth.deleteUser(u.id)))
  } finally {
    await prisma.$disconnect()
  }
})

test('ordinary customer cannot invoke platform-admin read or mutation endpoints directly', { skip: !enabled }, async () => {
  const headers = await auth.getAuthHeaders({ userId: customer.id })
  const readPaths = ['/api/admin/analytics', '/api/admin/jobs', '/api/admin/kyc', '/api/admin/payments', '/api/admin/pricing', '/api/admin/vendors']
  for (const path of readPaths) assert.ok([401, 403].includes(await request(headers, path)), `${path} was not protected`)
  const mutations: Array<[string, string, string]> = [
    ['/api/admin/jobs', 'POST', '{}'],
    ['/api/admin/kyc', 'POST', JSON.stringify({ action: 'review', userId: customer.id, status: 'VERIFIED' })],
    ['/api/admin/pricing', 'POST', JSON.stringify({ action: 'create', pointCost: 1, reason: 'unauthorized' })],
    ['/api/admin/vendors', 'POST', JSON.stringify({ name: 'Unauthorized Vendor', category: 'test' })],
    [`/api/admin/vendors/${crypto.randomUUID()}`, 'PATCH', JSON.stringify({ status: 'SUSPENDED' })],
    [`/api/admin/users/${customer.id}/points`, 'POST', JSON.stringify({ amount: 10, reason: 'unauthorized' })],
  ]
  for (const [path, method, body] of mutations) assert.ok([401, 403].includes(await request(headers, path, { method, headers: { 'content-type': 'application/json' }, body })), `${method} ${path} was not protected`)
})

test('super admin can reach protected admin surfaces', { skip: !enabled }, async () => {
  const headers = await auth.getAuthHeaders({ userId: admin.id })
  for (const path of ['/api/admin/analytics', '/api/admin/jobs', '/api/admin/kyc', '/api/admin/payments', '/api/admin/pricing', '/api/admin/vendors']) {
    const status = await request(headers, path)
    assert.ok(status === 200 || status === 400, `${path} unexpectedly returned ${status}`)
  }
})
