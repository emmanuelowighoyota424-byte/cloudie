import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { getPrivateObject } from '@/lib/storage'
import { Prisma } from '@prisma/client'

export const runtime = 'nodejs'

export async function GET(_: Request, context: { params: Promise<{ submissionId: string }> }) {
  try {
    await requireSuperAdmin()
    const { submissionId } = await context.params
    const rows = await prisma.$queryRaw<Array<{ storageKey: string; mimeType: string; originalFilename: string }>>(Prisma.sql`SELECT "storageKey","mimeType","originalFilename" FROM "KYCSubmission" WHERE "id"=${submissionId} LIMIT 1`)
    const submission = rows[0]
    if (!submission) return NextResponse.json({ error: 'KYC document not found' }, { status: 404 })
    const response = await getPrivateObject(submission.storageKey)
    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': submission.mimeType,
        'Content-Disposition': `inline; filename="${submission.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to view KYC document'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}
