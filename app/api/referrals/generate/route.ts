import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

function makeCode() {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return `CLD-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

export async function POST() {
  try {
    const user = await requireUser()
    const existing = await prisma.$queryRaw<Array<{ referralCode: string | null }>>`SELECT "referralCode" FROM "User" WHERE "id"=${user.id} LIMIT 1`
    if (existing[0]?.referralCode) return NextResponse.json({ ok: true, data: { code: existing[0].referralCode } })
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode()
      try {
        const rows = await prisma.$queryRaw<Array<{ referralCode: string }>>`UPDATE "User" SET "referralCode"=${code} WHERE "id"=${user.id} AND "referralCode" IS NULL RETURNING "referralCode"`
        if (rows[0]) return NextResponse.json({ ok: true, data: { code } }, { status: 201 })
        const retry = await prisma.$queryRaw<Array<{ referralCode: string | null }>>`SELECT "referralCode" FROM "User" WHERE "id"=${user.id} LIMIT 1`
        if (retry[0]?.referralCode) return NextResponse.json({ ok: true, data: { code: retry[0].referralCode } })
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (!message.toLowerCase().includes('unique')) throw error
      }
    }
    return NextResponse.json({ ok: false, error: { code: 'CODE_ALLOCATION_FAILED', message: 'Unable to generate a unique referral code' } }, { status: 503 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate referral code'
    return NextResponse.json({ ok: false, error: { code: 'REFERRAL_GENERATION_FAILED', message } }, { status: message.includes('Authentication') ? 401 : 500 })
  }
}
