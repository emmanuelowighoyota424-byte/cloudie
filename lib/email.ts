import net from 'node:net'
import tls from 'node:tls'

type EmailInput = {
  to: string
  subject: string
  html: string
  text: string
  idempotencyKey?: string
}

type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  username?: string
  password?: string
  from: string
}

class SmtpConnection {
  private buffer = ''
  private socket: net.Socket | tls.TLSSocket
  private pending: Array<(value: string) => void> = []

  constructor(socket: net.Socket | tls.TLSSocket) {
    this.socket = socket
    socket.setEncoding('utf8')
    socket.on('data', (chunk) => {
      this.buffer += chunk
      this.flush()
    })
  }

  private flush() {
    while (true) {
      const end = this.buffer.indexOf('\r\n')
      if (end < 0) return
      const line = this.buffer.slice(0, end)
      this.buffer = this.buffer.slice(end + 2)
      const waiter = this.pending.shift()
      if (waiter) waiter(line)
    }
  }

  readLine(timeoutMs = 15000): Promise<string> {
    if (this.buffer.includes('\r\n')) {
      const end = this.buffer.indexOf('\r\n')
      const line = this.buffer.slice(0, end)
      this.buffer = this.buffer.slice(end + 2)
      return Promise.resolve(line)
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.pending.indexOf(done)
        if (index >= 0) this.pending.splice(index, 1)
        reject(new Error('SMTP server response timed out'))
      }, timeoutMs)
      const done = (line: string) => {
        clearTimeout(timer)
        resolve(line)
      }
      this.pending.push(done)
    })
  }

  async readResponse(timeoutMs = 15000): Promise<string[]> {
    const lines: string[] = []
    const first = await this.readLine(timeoutMs)
    lines.push(first)
    const code = first.slice(0, 3)
    if (first[3] !== '-') return lines
    while (true) {
      const line = await this.readLine(timeoutMs)
      lines.push(line)
      if (line.startsWith(`${code} `)) return lines
    }
  }

  write(command: string) {
    this.socket.write(`${command}\r\n`)
  }

  close() {
    this.socket.end()
  }

  upgradeToTls(host: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const current = this.socket as net.Socket
      const secure = tls.connect({ socket: current, servername: host, rejectUnauthorized: true }, () => {
        this.socket = secure
        secure.setEncoding('utf8')
        secure.on('data', (chunk) => {
          this.buffer += chunk
          this.flush()
        })
        resolve()
      })
      secure.once('error', reject)
    })
  }
}

function requireEmailConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST?.trim()
  const from = process.env.EMAIL_FROM?.trim()
  if (!host || !from) throw new Error('EMAIL = BLOCKED — SMTP credentials unavailable')
  const port = Number(process.env.SMTP_PORT || (process.env.SMTP_SECURE === 'true' ? 465 : 587))
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP_PORT')
  const username = process.env.SMTP_USERNAME?.trim() || undefined
  const password = process.env.SMTP_PASSWORD || undefined
  if ((username && !password) || (!username && password)) throw new Error('SMTP_USERNAME and SMTP_PASSWORD must be provided together')
  return { host, port, secure: process.env.SMTP_SECURE === 'true' || port === 465, username, password, from }
}

async function expect(conn: SmtpConnection, expected: number | number[]) {
  const responses = await conn.readResponse()
  const code = Number(responses.at(-1)?.slice(0, 3))
  const accepted = Array.isArray(expected) ? expected : [expected]
  if (!accepted.includes(code)) throw new Error(`SMTP command failed (${code}): ${responses.at(-1) ?? 'empty response'}`)
}

async function authenticate(conn: SmtpConnection, username: string, password: string) {
  conn.write('AUTH PLAIN')
  const challenge = await conn.readResponse()
  const challengeCode = Number(challenge.at(-1)?.slice(0, 3))
  if (challengeCode === 334) {
    conn.write(Buffer.from(`\0${username}\0${password}`).toString('base64'))
    await expect(conn, 235)
    return
  }
  if (challengeCode !== 504 && challengeCode !== 502 && challengeCode !== 500) {
    throw new Error(`SMTP AUTH PLAIN failed (${challengeCode})`)
  }

  conn.write('AUTH LOGIN')
  await expect(conn, 334)
  conn.write(Buffer.from(username).toString('base64'))
  await expect(conn, 334)
  conn.write(Buffer.from(password).toString('base64'))
  await expect(conn, 235)
}

function messageHeaders(input: EmailInput, from: string) {
  const headers = [
    `From: ${from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject.replace(/[\r\n]/g, ' ')}`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="cloudie-boundary"',
  ]
  if (input.idempotencyKey) headers.push(`X-Cloudie-Idempotency-Key: ${input.idempotencyKey.replace(/[\r\n]/g, '')}`)
  return `${headers.join('\r\n')}\r\n\r\n--cloudie-boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${input.text}\r\n--cloudie-boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${input.html}\r\n--cloudie-boundary--\r\n`
}

export async function sendEmail(input: EmailInput) {
  const config = requireEmailConfig()
  const socket = config.secure
    ? tls.connect({ host: config.host, port: config.port, servername: config.host, rejectUnauthorized: true })
    : net.createConnection({ host: config.host, port: config.port })
  const conn = new SmtpConnection(socket)
  socket.setTimeout(20000, () => socket.destroy(new Error('SMTP connection timed out')))
  await expect(conn, 220)
  conn.write(`EHLO cloudie.local`)
  await expect(conn, 250)

  if (!config.secure) {
    conn.write('STARTTLS')
    await expect(conn, 220)
    await conn.upgradeToTls(config.host)
    conn.write('EHLO cloudie.local')
    await expect(conn, 250)
  }

  if (config.username && config.password) await authenticate(conn, config.username, config.password)
  conn.write(`MAIL FROM:<${config.from}>`)
  await expect(conn, 250)
  conn.write(`RCPT TO:<${input.to}>`)
  await expect(conn, [250, 251])
  conn.write('DATA')
  await expect(conn, 354)
  const body = messageHeaders(input, config.from).replace(/^\./gm, '..')
  conn.write(`${body}\r\n.`)
  await expect(conn, 250)
  conn.write('QUIT')
  try { await expect(conn, 221) } finally { conn.close() }
}

export function absoluteAppUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
  return new URL(path, base).toString()
}
