import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../../lib/prisma'
import { getTestAuth } from './auth-test'

const enabled = Boolean(process.env.E2E_BASE_URL)
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000'
let auth: Awaited<ReturnType<typeof getTestAuth>>
let userA: { id: string }
let userB: { id: string }

before(async () => {
  if (!enabled) return
  auth = await getTestAuth()
  const prefix = `sse-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  userA = await auth.saveUser(auth.createUser({ email: `${prefix}-a@example.test`, name: 'SSE A', emailVerified: true }))
  userB = await auth.saveUser(auth.createUser({ email: `${prefix}-b@example.test`, name: 'SSE B', emailVerified: true }))
  await prisma.notification.create({ data: { id: crypto.randomUUID(), userId: userA.id, type: 'TEST', title: 'A private', message: 'A only' } })
  await prisma.notification.create({ data: { id: crypto.randomUUID(), userId: userB.id, type: 'TEST', title: 'B private', message: 'B only' } })
})

after(async () => {
  if (!enabled) return
  await prisma.notification.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } })
  await Promise.all([userA, userB].map((u) => auth.deleteUser(u.id)))
  await prisma.$disconnect()
})

async function readFirstChunk(userId: string) {
  const headers = await auth.getAuthHeaders({ userId })
  const controller = new AbortController()
  const response = await fetch(`${baseURL}/api/realtime/notifications`, { headers, signal: controller.signal })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type')?.startsWith('text/event-stream'), true)
  const reader = response.body?.getReader()
  assert.ok(reader)
  const result = await reader.read()
  controller.abort()
  return new TextDecoder().decode(result.value)
}

test('unauthenticated realtime connection is rejected', { skip: !enabled }, async () => {
  const response = await fetch(`${baseURL}/api/realtime/notifications`)
  assert.equal(response.status, 401)
})

test('SSE stream is user-scoped and cannot leak another users notifications', { skip: !enabled }, async () => {
  const [a, b] = await Promise.all([readFirstChunk(userA.id), readFirstChunk(userB.id)])
  assert.match(a, new RegExp(userA.id))
  assert.match(b, new RegExp(userB.id))
  assert.doesNotMatch(a, new RegExp(userB.id))
  assert.doesNotMatch(b, new RegExp(userA.id))
  assert.match(a, /event: notification|event: ready/)
  assert.match(b, /event: notification|event: ready/)
})
