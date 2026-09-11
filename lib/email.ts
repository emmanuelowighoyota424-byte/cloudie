type EmailInput = {
  to: string
  subject: string
  html: string
  text: string
  idempotencyKey?: string
}

function requireEmailConfig() {
  const provider = (process.env.EMAIL_PROVIDER ?? '').toUpperCase()
  const apiKey = process.env.EMAIL_API_KEY
  const from = process.env.EMAIL_FROM
  if (provider !== 'RESEND' || !apiKey || !from) {
    throw new Error('Transactional email is not configured. Set EMAIL_PROVIDER=RESEND, EMAIL_API_KEY and EMAIL_FROM.')
  }
  return { apiKey, from }
}

export async function sendEmail(input: EmailInput) {
  const { apiKey, from } = requireEmailConfig()
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Email provider rejected the message (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`)
  }
}

export function absoluteAppUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
  return new URL(path, base).toString()
}
