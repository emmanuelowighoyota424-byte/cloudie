import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireWorkspaceMember } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { getCryptoProvider } from '@/lib/crypto/provider'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : ''
    const asset = typeof body?.asset === 'string' ? body.asset.toUpperCase() : ''
    const network = typeof body?.network === 'string' ? body.network : ''
    if (!workspaceId || !asset || !network) return NextResponse.json({ error: 'workspaceId, asset and network are required' }, { status: 400 })
    const { user } = await requireWorkspaceMember(workspaceId)
    const provider = getCryptoProvider()
    const address = await provider.createDepositAddress({ customerId: user.id, asset, network })
    const id = crypto.randomUUID()
    await prisma.$executeRaw(Prisma.sql`INSERT INTO "CryptoDeposit" ("id","workspaceId","userId","provider","asset","network","address","providerReference","metadata") VALUES (${id},${workspaceId},${user.id},${process.env.CRYPTO_PROVIDER_NAME ?? 'configured'},${asset},${network},${address.address},${address.reference ?? null},${JSON.stringify({ createdBy: 'cloudie' })}::jsonb)`)
    return NextResponse.json({ id, address: address.address, reference: address.reference, status: 'PENDING' }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Crypto provider unavailable'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 503 })
  }
}
