import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireWorkspaceRole } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

const clean = (value: unknown, max = 300) => typeof value === 'string' ? value.trim().slice(0, max) : ''

export async function GET(request: Request) {
  try {
    const workspaceId = clean(new URL(request.url).searchParams.get('workspaceId'), 100)
    if (!workspaceId) return NextResponse.json({ ok: false, error: { code: 'INVALID_WORKSPACE', message: 'workspaceId is required' } }, { status: 400 })
    await requireWorkspaceRole(workspaceId, ['SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER'])
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`SELECT "siteType","logoUrl","primaryColor","siteTitle","faviconUrl","contactEmail","lockedAt","renewalDate" FROM "TenantProfile" WHERE "workspaceId"=${workspaceId} LIMIT 1`)
    return NextResponse.json({ ok: true, data: { workspaceId, settings: rows[0] ?? null } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load business settings'
    return NextResponse.json({ ok: false, error: { code: 'SETTINGS_READ_FAILED', message } }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const workspaceId = clean(body?.workspaceId, 100)
    if (!workspaceId) return NextResponse.json({ ok: false, error: { code: 'INVALID_WORKSPACE', message: 'workspaceId is required' } }, { status: 400 })
    const { user } = await requireWorkspaceRole(workspaceId, ['SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER'])
    const siteType = clean(body?.siteType, 40) || 'BUSINESS'
    const logoUrl = clean(body?.logoUrl, 1000) || null
    const primaryColor = clean(body?.primaryColor, 30) || '#111827'
    const siteTitle = clean(body?.siteTitle, 160) || null
    const faviconUrl = clean(body?.faviconUrl, 1000) || null
    const contactEmail = clean(body?.contactEmail, 320) || null
    if (contactEmail && !/^\S+@\S+\.\S+$/.test(contactEmail)) return NextResponse.json({ ok: false, error: { code: 'INVALID_EMAIL', message: 'Invalid contact email' } }, { status: 400 })
    const id = crypto.randomUUID()
    await prisma.$executeRaw(Prisma.sql`INSERT INTO "TenantProfile" ("id","workspaceId","siteType","logoUrl","primaryColor","siteTitle","faviconUrl","contactEmail") VALUES (${id},${workspaceId},${siteType},${logoUrl},${primaryColor},${siteTitle},${faviconUrl},${contactEmail}) ON CONFLICT ("workspaceId") DO UPDATE SET "siteType"=EXCLUDED."siteType","logoUrl"=EXCLUDED."logoUrl","primaryColor"=EXCLUDED."primaryColor","siteTitle"=EXCLUDED."siteTitle","faviconUrl"=EXCLUDED."faviconUrl","contactEmail"=EXCLUDED."contactEmail`)
    await prisma.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'business.settings_changed', entity: 'TenantProfile', entityId: id, metadata: { siteType } } })
    return NextResponse.json({ ok: true, data: { workspaceId, settings: { siteType, logoUrl, primaryColor, siteTitle, faviconUrl, contactEmail } } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update business settings'
    return NextResponse.json({ ok: false, error: { code: 'SETTINGS_UPDATE_FAILED', message } }, { status: message.includes('Authentication') ? 401 : 400 })
  }
}
