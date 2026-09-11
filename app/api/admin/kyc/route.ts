import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireSuperAdmin } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await requireSuperAdmin()
    const rows = await prisma.$queryRaw(Prisma.sql`SELECT k."id",k."userId",k."status",k."submittedAt",k."reviewedAt",u."email",u."name",COALESCE(json_agg(json_build_object('id',s."id",'documentType',s."documentType",'originalFilename',s."originalFilename",'mimeType',s."mimeType",'status',s."status",'createdAt',s."createdAt")) FILTER (WHERE s."id" IS NOT NULL),'[]') AS "submissions" FROM "KYCVerification" k JOIN "User" u ON u."id"=k."userId" LEFT JOIN "KYCSubmission" s ON s."kycId"=k."id" GROUP BY k."id",u."email",u."name" ORDER BY k."submittedAt" DESC LIMIT 200`)
    return NextResponse.json({ items: rows })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load KYC queue'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}
