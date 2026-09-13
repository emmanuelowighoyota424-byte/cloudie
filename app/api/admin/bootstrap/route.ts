import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const configuredPassword = process.env.ADMIN_PASSWORD

  if (!configuredEmail || !configuredPassword) {
    return NextResponse.json({ error: 'Admin credentials are not configured on the server' }, { status: 503 })
  }

  let body: { email?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (email !== configuredEmail || password !== configuredPassword) {
    return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    if (existing.role !== 'SUPER_ADMIN' || !existing.emailVerified) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: 'SUPER_ADMIN', emailVerified: true, suspendedAt: null },
      })
    }
    return NextResponse.json({ ok: true, existing: true }, { status: 200 })
  }

  const result = await auth.api.signUpEmail({
    body: {
      email,
      password,
      name: 'Cloudie Administrator',
    },
  })

  if (!result?.user?.id) {
    return NextResponse.json({ error: 'Unable to create administrator account' }, { status: 500 })
  }

  await prisma.user.update({
    where: { id: result.user.id },
    data: { role: 'SUPER_ADMIN', emailVerified: true },
  })

  return NextResponse.json({ ok: true, existing: false }, { status: 201 })
}
