import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/authorization'
import { attributeReferral, normalizeReferralCode } from '@/lib/referrals'

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const code = normalizeReferralCode(body?.code)
    if (!code) return NextResponse.json({ error: 'A valid referral code is required' }, { status: 400 })
    const result = await attributeReferral(user.id, user.email, code)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to claim referral'
    const status = message.includes('Authentication') ? 401 : message.includes('not allowed') || message.includes('mismatch') ? 400 : 404
    return NextResponse.json({ error: message }, { status })
  }
}
