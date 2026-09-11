import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireSuperAdmin } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await requireSuperAdmin()
    const jobs = await prisma.$queryRaw(Prisma.sql`SELECT "id","type","workspaceId","status","attempts","maxAttempts","runAt","startedAt","finishedAt","lastError","createdAt","updatedAt" FROM "CloudieJob" ORDER BY "createdAt" DESC LIMIT 200`)
    return NextResponse.json({ jobs })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load jobs'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}
