import http from 'node:http'
import crypto from 'node:crypto'
import { Pool } from 'pg'

const PORT = Number(process.env.PORT || 10000)
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('DATABASE_URL is required')
const pool = new Pool({ connectionString: DATABASE_URL })
const allowedOrigins = new Set((process.env.REALTIME_ALLOWED_ORIGINS || 'https://cloudie-five.vercel.app').split(',').map((x) => x.trim()).filter(Boolean))

const clients = new Set()
let cursor = 0n
let pumping = false

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex') }
function originAllowed(origin) {
  if (!origin) return false
  if (allowedOrigins.has(origin)) return true
  try {
    const url = new URL(origin)
    return url.hostname.endsWith('.vercel.app') && allowedOrigins.has('https://cloudie-five.vercel.app')
  } catch { return false }
}

function frame(payload, opcode = 0x1) {
  const body = Buffer.from(payload)
  let header
  if (body.length < 126) header = Buffer.from([0x80 | opcode, body.length])
  else if (body.length < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(body.length, 2) }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(body.length), 2) }
  return Buffer.concat([header, body])
}
function parseFrames(buffer) {
  const messages = []
  let offset = 0
  while (buffer.length - offset >= 2) {
    const first = buffer[offset]; const second = buffer[offset + 1]
    const opcode = first & 0x0f; const masked = (second & 0x80) !== 0
    let length = second & 0x7f; let header = 2
    if (length === 126) { if (buffer.length - offset < 4) break; length = buffer.readUInt16BE(offset + 2); header = 4 }
    else if (length === 127) { if (buffer.length - offset < 10) break; const n = buffer.readBigUInt64BE(offset + 2); if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('frame too large'); length = Number(n); header = 10 }
    const maskBytes = masked ? 4 : 0
    if (buffer.length - offset < header + maskBytes + length) break
    let start = offset + header
    const mask = masked ? buffer.subarray(start, start + 4) : null
    start += maskBytes
    const data = Buffer.from(buffer.subarray(start, start + length))
    if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4]
    messages.push({ opcode, data })
    offset = start + length
  }
  return { messages, rest: buffer.subarray(offset) }
}

async function consumeTicket(raw) {
  const hash = sha256(raw)
  const result = await pool.query(`DELETE FROM "RealtimeTicket" WHERE "tokenHash"=$1 AND "expiresAt">CURRENT_TIMESTAMP RETURNING "sessionId","userId","workspaceId"`, [hash])
  return result.rows[0] || null
}
async function authenticateTicket(raw) {
  const ticket = await consumeTicket(raw)
  if (!ticket) return null
  const result = await pool.query(`SELECT s."id",s."userId",s."expiresAt",u."suspendedAt" FROM "Session" s JOIN "User" u ON u."id"=s."userId" WHERE s."id"=$1`, [ticket.sessionId])
  const session = result.rows[0]
  if (!session || new Date(session.expiresAt).getTime() <= Date.now() || session.suspendedAt) return null
  if (session.userId !== ticket.userId) return null
  if (ticket.workspaceId) {
    const member = await pool.query(`SELECT 1 FROM "WorkspaceMember" WHERE "workspaceId"=$1 AND "userId"=$2 AND "status"='ACTIVE'`, [ticket.workspaceId, ticket.userId])
    if (!member.rowCount) return null
  }
  return { userId: ticket.userId, workspaceId: ticket.workspaceId, sessionId: ticket.sessionId }
}

async function isWorkspaceMember(userId, workspaceId) {
  const r = await pool.query(`SELECT 1 FROM "WorkspaceMember" WHERE "workspaceId"=$1 AND "userId"=$2 AND "status"='ACTIVE'`, [workspaceId, userId])
  return Boolean(r.rowCount)
}
async function canReceive(event, client) {
  if (event.userId && event.userId === client.userId) return true
  if (event.eventType === 'ORDER_MESSAGE_CREATED') {
    const r = await pool.query(`SELECT p."userId" FROM "OrderChatMessage" m JOIN "OrderChatParticipant" p ON p."conversationId"=m."conversationId" WHERE m."id"=$1`, [event.entityId])
    return r.rows.some((x) => x.userId === client.userId)
  }
  if (!event.workspaceId || event.workspaceId !== client.workspaceId) return false
  if (!(await isWorkspaceMember(client.userId, event.workspaceId))) return false

  if (event.entityType === 'Notification') {
    const r = await pool.query(`SELECT "userId" FROM "Notification" WHERE "id"=$1`, [event.entityId])
    return Boolean(r.rowCount && r.rows[0].userId === client.userId)
  }
  if (event.entityType === 'Shipment' || event.entityType === 'ShipmentEvent') {
    const id = event.entityType === 'Shipment' ? event.entityId : event.entityId
    const r = await pool.query(`SELECT s."creatorId",s."driverId",s."customerId",d."userId" AS "driverUserId",c."email" AS "customerEmail",u."email" AS "viewerEmail" FROM "Shipment" s LEFT JOIN "Driver" d ON d."id"=s."driverId" LEFT JOIN "Customer" c ON c."id"=s."customerId" JOIN "User" u ON u."id"=$2 WHERE s."id"=$1`, [id, client.userId])
    if (!r.rowCount) {
      if (event.entityType === 'ShipmentEvent') {
        const e = await pool.query(`SELECT "shipmentId" FROM "ShipmentEvent" WHERE "id"=$1`, [event.entityId])
        if (!e.rowCount) return false
        return canReceive({ ...event, entityType: 'Shipment', entityId: e.rows[0].shipmentId }, client)
      }
      return false
    }
    const row = r.rows[0]
    return row.creatorId === client.userId || row.driverUserId === client.userId || (row.customerEmail && row.customerEmail === row.viewerEmail)
  }
  if (event.entityType === 'Order' || event.entityType === 'Payment') {
    const orderId = event.entityType === 'Order' ? event.entityId : (await pool.query(`SELECT "orderId" FROM "Payment" WHERE "id"=$1`, [event.entityId])).rows[0]?.orderId
    if (!orderId) return false
    const r = await pool.query(`SELECT "userId" FROM "Order" WHERE "id"=$1`, [orderId])
    return r.rowCount && r.rows[0].userId === client.userId
  }
  if (event.entityType === 'Document') {
    const r = await pool.query(`SELECT d."ownerId",s."userId" AS "sharedUserId" FROM "Document" d LEFT JOIN "DocumentShare" s ON s."documentId"=d."id" AND s."userId"=$2 AND (s."expiresAt" IS NULL OR s."expiresAt">CURRENT_TIMESTAMP) AND s."revokedAt" IS NULL WHERE d."id"=$1`, [event.entityId, client.userId])
    return Boolean(r.rowCount && (r.rows[0].ownerId === client.userId || r.rows[0].sharedUserId === client.userId))
  }
  if (event.eventType === 'JOB_STATUS_CHANGED') return ['ADMIN','SUPER_ADMIN'].includes((await pool.query(`SELECT "role" FROM "User" WHERE "id"=$1`, [client.userId])).rows[0]?.role)
  return true
}

async function deliver(event) {
  for (const client of clients) {
    if (client.workspaceId && event.workspaceId && client.workspaceId !== event.workspaceId) continue
    try {
      if (await canReceive(event, client)) {
        const message = JSON.stringify({ type: 'event', id: String(event.id), eventType: event.eventType, entityType: event.entityType, entityId: event.entityId, workspaceId: event.workspaceId, at: event.createdAt })
        client.socket.write(frame(message))
        client.lastSent = BigInt(event.id)
      }
    } catch (error) { console.error('realtime authorization failure', error) }
  }
}
async function pump() {
  if (pumping) return
  pumping = true
  try {
    const result = await pool.query(`SELECT "id","eventType","entityType","entityId","userId","workspaceId","createdAt" FROM "RealtimeEvent" WHERE "id">$1 ORDER BY "id" ASC LIMIT 250`, [cursor.toString()])
    for (const event of result.rows) { cursor = BigInt(event.id); await deliver(event) }
  } finally { pumping = false }
}
async function replay(client, since) {
  let after = BigInt(since || 0)
  const result = await pool.query(`SELECT "id","eventType","entityType","entityId","userId","workspaceId","createdAt" FROM "RealtimeEvent" WHERE "id">$1 ORDER BY "id" ASC LIMIT 250`, [after.toString()])
  for (const event of result.rows) { await deliverToClient(event, client); after = BigInt(event.id) }
  client.lastSent = after
}
async function deliverToClient(event, client) {
  if (client.workspaceId && event.workspaceId && client.workspaceId !== event.workspaceId) return
  if (!(await canReceive(event, client))) return
  client.socket.write(frame(JSON.stringify({ type: 'event', id: String(event.id), eventType: event.eventType, entityType: event.entityType, entityId: event.entityId, workspaceId: event.workspaceId, at: event.createdAt })))
}

async function handleMessage(client, message) {
  let value
  try { value = JSON.parse(message.toString()) } catch { client.socket.write(frame(JSON.stringify({ type: 'error', error: 'Invalid JSON' }))); return }
  if (value.type === 'subscribe') {
    if (value.workspaceId && !(await isWorkspaceMember(client.userId, value.workspaceId))) { client.socket.end(frame('', 0x8)); return }
    client.workspaceId = value.workspaceId || client.workspaceId || null
    await replay(client, Number.isSafeInteger(Number(value.since)) ? Number(value.since) : 0)
    client.socket.write(frame(JSON.stringify({ type: 'subscribed', workspaceId: client.workspaceId, cursor: String(client.lastSent || 0n) })))
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ ok: true, service: 'cloudie-realtime' })); return }
  res.writeHead(404); res.end()
})
server.on('upgrade', async (req, socket) => {
  try {
    const origin = req.headers.origin
    if (!originAllowed(origin)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return }
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    if (url.pathname !== '/ws') { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return }
    const ticket = url.searchParams.get('ticket')
    if (!ticket) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return }
    const auth = await authenticateTicket(ticket)
    if (!auth) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return }
    const key = req.headers['sec-websocket-key']
    if (!key) { socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'); socket.destroy(); return }
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
    const client = { socket, ...auth, lastSent: 0n }
    clients.add(client)
    socket.write(frame(JSON.stringify({ type: 'ready', userId: client.userId, workspaceId: client.workspaceId })))
    let incoming = Buffer.alloc(0)
    socket.on('data', (chunk) => {
      incoming = Buffer.concat([incoming, chunk])
      try {
        const parsed = parseFrames(incoming); incoming = parsed.rest
        for (const message of parsed.messages) {
          if (message.opcode === 0x8) { socket.end(); return }
          if (message.opcode === 0x9) { socket.write(frame(message.data, 0xA)); continue }
          if (message.opcode === 0x1) void handleMessage(client, message.data)
        }
      } catch { socket.end() }
    })
    socket.on('close', () => clients.delete(client))
    socket.on('error', () => clients.delete(client))
  } catch (error) { console.error('realtime upgrade failed', error); socket.destroy() }
})

const listener = await pool.connect()
await listener.query('LISTEN cloudie_realtime')
listener.on('notification', () => void pump())
await pump()
setInterval(() => void pump(), 5000)
server.listen(PORT, '0.0.0.0', () => console.log(`Cloudie realtime server listening on ${PORT}`))
process.on('SIGTERM', async () => { server.close(); listener.release(); await pool.end(); process.exit(0) })
