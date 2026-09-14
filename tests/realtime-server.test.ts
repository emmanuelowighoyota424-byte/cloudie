import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma'

const port = 10001
const origin = 'http://127.0.0.1:3000'

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function maskedFrame(value: string) {
  const body = Buffer.from(value)
  const mask = Buffer.from([11, 37, 71, 101])
  const out = Buffer.alloc(2 + 4 + body.length)
  out[0] = 0x81
  out[1] = 0x80 | body.length
  mask.copy(out, 2)
  for (let i = 0; i < body.length; i += 1) {
    out[6 + i] = body[i] ^ mask[i % 4]
  }
  return out
}

function parseFrame(buffer: Buffer) {
  if (buffer.length < 2) return null
  let length = buffer[1] & 0x7f
  let offset = 2
  if (length === 126) {
    if (buffer.length < 4) return null
    length = buffer.readUInt16BE(2)
    offset = 4
  }
  if (length === 127) throw new Error('test frame too large')
  if (buffer.length < offset + length) return null
  return {
    value: JSON.parse(buffer.subarray(offset, offset + length).toString()) as Record<string, unknown>,
    bytes: offset + length,
  }
}

async function waitForHealth() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      if (response.ok) return
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('realtime server did not become healthy')
}

async function connect(ticket: string) {
  return await new Promise<{
    socket: net.Socket
    wait: (predicate: (value: Record<string, unknown>) => boolean) => Promise<Record<string, unknown>>
  }>((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1')
    let buffer = Buffer.alloc(0)
    const queue: Array<{
      predicate: (value: Record<string, unknown>) => boolean
      resolve: (value: Record<string, unknown>) => void
      reject: (error: Error) => void
    }> = []
    let upgraded = false

    const wait = (predicate: (value: Record<string, unknown>) => boolean) =>
      new Promise<Record<string, unknown>>((resolveWait, rejectWait) => {
        queue.push({ predicate, resolve: resolveWait, reject: rejectWait })
      })

    socket.on('connect', () => {
      const key = Buffer.from(randomUUID()).toString('base64')
      socket.write(
        `GET /ws?ticket=${encodeURIComponent(ticket)} HTTP/1.1\r\n` +
          `Host: 127.0.0.1:${port}\r\n` +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Key: ${key}\r\n` +
          'Sec-WebSocket-Version: 13\r\n' +
          `Origin: ${origin}\r\n\r\n`,
      )
    })

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      if (!upgraded) {
        const marker = buffer.indexOf('\r\n\r\n')
        if (marker < 0) return
        const headers = buffer.subarray(0, marker).toString()
        if (!headers.startsWith('HTTP/1.1 101')) {
          reject(new Error(headers))
          socket.destroy()
          return
        }
        upgraded = true
        buffer = buffer.subarray(marker + 4)
      }

      while (true) {
        const parsed = parseFrame(buffer)
        if (!parsed) break
        buffer = buffer.subarray(parsed.bytes)
        for (let i = 0; i < queue.length; i += 1) {
          if (queue[i].predicate(parsed.value)) {
            const item = queue.splice(i, 1)[0]
            item.resolve(parsed.value)
            break
          }
        }
      }
    })

    socket.on('error', (error) => {
      for (const item of queue) item.reject(error)
      reject(error)
    })

    resolve({ socket, wait })
  })
}

async function makeTicket(userId: string, sessionId: string, workspaceId: string) {
  const raw = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')
  await prisma.$executeRaw`
    INSERT INTO "RealtimeTicket"("id","tokenHash","sessionId","userId","workspaceId","expiresAt")
    VALUES (${randomUUID()}, ${sha256(raw)}, ${sessionId}, ${userId}, ${workspaceId}, CURRENT_TIMESTAMP + INTERVAL '60 seconds')
  `
  return raw
}

test('persistent realtime server authenticates, scopes events and replays outbox events', async () => {
  const userA = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: 'Realtime A',
      email: `realtime-a-${Date.now()}@example.test`,
      emailVerified: true,
    },
  })
  const userB = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: 'Realtime B',
      email: `realtime-b-${Date.now()}@example.test`,
      emailVerified: true,
    },
  })
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Realtime Test',
      slug: `realtime-${Date.now()}`,
      ownerId: userA.id,
      members: { create: { userId: userA.id, role: 'WORKSPACE_ADMIN' } },
    },
  })
  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: userB.id, role: 'CUSTOMER' },
  })

  const sessionA = await prisma.session.create({
    data: {
      id: randomUUID(),
      token: randomUUID(),
      userId: userA.id,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  })
  const sessionB = await prisma.session.create({
    data: {
      id: randomUUID(),
      token: randomUUID(),
      userId: userB.id,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  })

  let child: ChildProcess | null = null
  let socketA: net.Socket | null = null
  let socketB: net.Socket | null = null
  let replaySocket: net.Socket | null = null
  let sessionA2Id: string | null = null
  let notificationAId: string | null = null
  let notificationBId: string | null = null

  try {
    const ticketA = await makeTicket(userA.id, sessionA.id, workspace.id)
    const ticketB = await makeTicket(userB.id, sessionB.id, workspace.id)

    child = spawn('node', ['realtime/server.mjs'], {
      env: { ...process.env, PORT: String(port), REALTIME_ALLOWED_ORIGINS: origin },
      stdio: 'ignore',
    })

    await waitForHealth()

    const a = await connect(ticketA)
    const b = await connect(ticketB)
    socketA = a.socket
    socketB = b.socket

    await a.wait((value) => value.type === 'ready')
    await b.wait((value) => value.type === 'ready')

    socketA.write(maskedFrame(JSON.stringify({ type: 'subscribe', workspaceId: workspace.id, since: 0 })))
    socketB.write(maskedFrame(JSON.stringify({ type: 'subscribe', workspaceId: workspace.id, since: 0 })))
    await a.wait((value) => value.type === 'subscribed')
    await b.wait((value) => value.type === 'subscribed')

    const notificationA = await prisma.notification.create({
      data: {
        userId: userA.id,
        workspaceId: workspace.id,
        type: 'TEST',
        title: 'Private A',
        message: 'A only',
      },
    })
    notificationAId = notificationA.id

    const notificationB = await prisma.notification.create({
      data: {
        userId: userB.id,
        workspaceId: workspace.id,
        type: 'TEST',
        title: 'Private B',
        message: 'B only',
      },
    })
    notificationBId = notificationB.id

    const eventA = await a.wait((value) => value.type === 'event' && value.entityId === notificationA.id)
    assert.equal(eventA.eventType, 'NOTIFICATION_CREATED')

    const bLeak = await Promise.race([
      b.wait((value) => value.type === 'event' && value.entityId === notificationA.id).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500)),
    ])
    assert.equal(bLeak, false)

    const cursor = Number(eventA.id)
    socketA.end()
    socketB.end()
    socketA = null
    socketB = null

    const sessionA2 = await prisma.session.create({
      data: {
        id: randomUUID(),
        token: randomUUID(),
        userId: userA.id,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    })
    sessionA2Id = sessionA2.id

    const ticketA2 = await makeTicket(userA.id, sessionA2.id, workspace.id)
    const replay = await connect(ticketA2)
    replaySocket = replay.socket
    await replay.wait((value) => value.type === 'ready')
    replaySocket.write(
      maskedFrame(JSON.stringify({ type: 'subscribe', workspaceId: workspace.id, since: Math.max(0, cursor - 1) })),
    )
    const replayed = await replay.wait((value) => value.type === 'event' && value.entityId === notificationA.id)
    assert.equal(replayed.eventType, 'NOTIFICATION_CREATED')
    assert.ok(Number(replayed.id) >= cursor)
  } finally {
    socketA?.destroy()
    socketB?.destroy()
    replaySocket?.destroy()
    child?.kill('SIGTERM')
    if (sessionA2Id) await prisma.session.delete({ where: { id: sessionA2Id } }).catch(() => undefined)
    if (notificationAId || notificationBId) {
      await prisma.notification.deleteMany({
        where: { id: { in: [notificationAId, notificationBId].filter((id): id is string => Boolean(id)) } },
      })
    }
    await prisma.session.deleteMany({ where: { id: { in: [sessionA.id, sessionB.id] } } })
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: workspace.id } })
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => undefined)
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } })
  }
})
