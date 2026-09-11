import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/authorization'
import { getPointBalance, getPointLedger } from '@/lib/points'

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const take = Number(url.searchParams.get('take') ?? 50)
    const skip = Number(url.searchParams.get('skip') ?? 0)
    const [balance, transactions] = await Promise.all([
      getPointBalance(user.id),
      getPointLedger(user.id, { take, skip }),
    ])

    return NextResponse.json({
      balance,
      transactions,
      nextSkip: transactions.length === Math.min(Math.max(take, 1), 200) ? skip + transactions.length : null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load wallet'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}
