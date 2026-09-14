import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireWorkspaceRole } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    await requireWorkspaceRole(workspaceId, ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF','CUSTOMER'])
    const [staff, departments, invoices, customers, products, orders, investmentPlans, billingConfig, tenantProfile, domains] = await Promise.all([
      prisma.$queryRaw(Prisma.sql`SELECT * FROM "BusinessStaff" WHERE "workspaceId"=${workspaceId} ORDER BY "createdAt" DESC LIMIT 200`),
      prisma.$queryRaw(Prisma.sql`SELECT * FROM "BusinessDepartment" WHERE "workspaceId"=${workspaceId} ORDER BY "name" ASC`),
      prisma.$queryRaw(Prisma.sql`SELECT * FROM "BusinessInvoice" WHERE "workspaceId"=${workspaceId} ORDER BY "createdAt" DESC LIMIT 100`),
      prisma.customer.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.product.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.order.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`SELECT * FROM "BusinessInvestmentPlan" WHERE "workspaceId"=${workspaceId} ORDER BY "createdAt" DESC`),
      prisma.$queryRaw<Array<{ id:string; workspaceId:string; renewalPoints:number; autoRenew:boolean; status:string; updatedAt:Date }>>(Prisma.sql`SELECT * FROM "BusinessBillingConfig" WHERE "workspaceId"=${workspaceId} LIMIT 1`),
      prisma.$queryRaw<Array<{ siteType:string; logoUrl:string|null; primaryColor:string; siteTitle:string|null; faviconUrl:string|null; contactEmail:string|null; lockedAt:Date|null; renewalDate:Date|null }>>(Prisma.sql`SELECT "siteType","logoUrl","primaryColor","siteTitle","faviconUrl","contactEmail","lockedAt","renewalDate" FROM "TenantProfile" WHERE "workspaceId"=${workspaceId} LIMIT 1`),
      prisma.$queryRaw<Array<{ id:string; hostname:string; status:string; verifiedAt:Date|null; active:boolean; createdAt:Date }>>(Prisma.sql`SELECT "id","hostname","status","verifiedAt","active","createdAt" FROM "TenantDomain" WHERE "workspaceId"=${workspaceId} ORDER BY "createdAt" DESC`),
    ])
    return NextResponse.json({ staff, departments, invoices, customers, products, orders, investmentPlans, billingConfig: billingConfig[0] ?? null, tenantProfile: tenantProfile[0] ?? null, domains })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load business suite'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user } = await requireWorkspaceRole(workspaceId, ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER'])
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const action = body?.action
    if (action === 'department') {
      const name = typeof body?.name === 'string' ? body.name.trim() : ''
      if (!name) return NextResponse.json({ error: 'Department name is required' }, { status: 400 })
      const id = crypto.randomUUID()
      await prisma.$executeRaw(Prisma.sql`INSERT INTO "BusinessDepartment" ("id","workspaceId","name") VALUES (${id},${workspaceId},${name}) ON CONFLICT ("workspaceId","name") DO NOTHING`)
      return NextResponse.json({ id }, { status: 201 })
    }
    if (action === 'staff') {
      const userId = typeof body?.userId === 'string' ? body.userId : ''
      const role = typeof body?.role === 'string' ? body.role : 'STAFF'
      if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
      const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } })
      if (!member) return NextResponse.json({ error: 'User is not a workspace member' }, { status: 400 })
      const departmentId = typeof body?.departmentId === 'string' ? body.departmentId : null
      if (departmentId) {
        const department = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "BusinessDepartment" WHERE "id"=${departmentId} AND "workspaceId"=${workspaceId} LIMIT 1`)
        if (!department.length) return NextResponse.json({ error: 'Department not found' }, { status: 404 })
      }
      const id = crypto.randomUUID()
      await prisma.$executeRaw(Prisma.sql`INSERT INTO "BusinessStaff" ("id","workspaceId","userId","departmentId","role") VALUES (${id},${workspaceId},${userId},${departmentId},${role}) ON CONFLICT ("workspaceId","userId") DO UPDATE SET "role"=EXCLUDED."role","departmentId"=EXCLUDED."departmentId","updatedAt"=CURRENT_TIMESTAMP`)
      await prisma.auditLog.create({ data: { actorId: user.id, workspaceId, action: 'business.staff_changed', entity: 'BusinessStaff', entityId: id, metadata: { userId, role } } })
      return NextResponse.json({ id }, { status: 201 })
    }
    if (action === 'invoice') {
      const number = typeof body?.number === 'string' ? body.number.trim() : ''
      const currency = typeof body?.currency === 'string' ? body.currency.toUpperCase() : 'USD'
      const items = Array.isArray(body?.items) ? body.items : []
      const subtotal = Number(body?.subtotal ?? 0)
      const tax = Number(body?.tax ?? 0)
      if (!number || !items.length || !Number.isFinite(subtotal) || !Number.isFinite(tax)) return NextResponse.json({ error: 'Invoice number, items and valid totals are required' }, { status: 400 })
      const customerId = typeof body?.customerId === 'string' ? body.customerId : null
      if (customerId) {
        const customer = await prisma.customer.findFirst({ where: { id: customerId, workspaceId }, select: { id: true } })
        if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      }
      const id = crypto.randomUUID()
      const dueAt = typeof body?.dueAt === 'string' ? new Date(body.dueAt) : null
      if (dueAt && Number.isNaN(dueAt.getTime())) return NextResponse.json({ error: 'Invalid dueAt' }, { status: 400 })
      await prisma.$executeRaw(Prisma.sql`INSERT INTO "BusinessInvoice" ("id","workspaceId","customerId","createdById","number","currency","subtotal","tax","total","dueAt","items") VALUES (${id},${workspaceId},${customerId},${user.id},${number},${currency},${subtotal},${tax},${subtotal + tax},${dueAt},${JSON.stringify(items)}::jsonb)`)
      return NextResponse.json({ id }, { status: 201 })
    }
    if (action === 'investment_plan') {
      const name = typeof body?.name === 'string' ? body.name.trim() : ''
      const currency = typeof body?.currency === 'string' ? body.currency.toUpperCase() : 'USD'
      const minimumAmount = Number(body?.minimumAmount ?? 0)
      const termDays = Number(body?.termDays ?? 0)
      const status = typeof body?.status === 'string' ? body.status : 'DRAFT'
      if (!name || !Number.isFinite(minimumAmount) || minimumAmount < 0 || !Number.isInteger(termDays) || termDays < 1) return NextResponse.json({ error: 'Name, minimum amount and positive integer termDays are required' }, { status: 400 })
      const id = crypto.randomUUID()
      await prisma.$executeRaw(Prisma.sql`INSERT INTO "BusinessInvestmentPlan" ("id","workspaceId","name","currency","minimumAmount","termDays","status") VALUES (${id},${workspaceId},${name},${currency},${minimumAmount},${termDays},${status}) ON CONFLICT ("workspaceId","name") DO UPDATE SET "currency"=EXCLUDED."currency","minimumAmount"=EXCLUDED."minimumAmount","termDays"=EXCLUDED."termDays","status"=EXCLUDED."status","updatedAt"=CURRENT_TIMESTAMP`)
      await prisma.auditLog.create({ data: { actorId:user.id, workspaceId, action:'business.investment_plan_changed', entity:'BusinessInvestmentPlan', entityId:id, metadata:{ name, status } } })
      return NextResponse.json({ id }, { status: 201 })
    }
    if (action === 'billing_config') {
      const renewalPoints = Number(body?.renewalPoints ?? 0)
      const autoRenew = body?.autoRenew === true
      const status = typeof body?.status === 'string' ? body.status : 'ACTIVE'
      if (!Number.isInteger(renewalPoints) || renewalPoints < 0) return NextResponse.json({ error:'renewalPoints must be a non-negative integer' }, { status:400 })
      const id = crypto.randomUUID()
      await prisma.$executeRaw(Prisma.sql`INSERT INTO "BusinessBillingConfig" ("id","workspaceId","renewalPoints","autoRenew","status") VALUES (${id},${workspaceId},${renewalPoints},${autoRenew},${status}) ON CONFLICT ("workspaceId") DO UPDATE SET "renewalPoints"=EXCLUDED."renewalPoints","autoRenew"=EXCLUDED."autoRenew","status"=EXCLUDED."status","updatedAt"=CURRENT_TIMESTAMP`)
      await prisma.auditLog.create({ data:{actorId:user.id,workspaceId,action:'business.billing_config_changed',entity:'BusinessBillingConfig',entityId:id,metadata:{renewalPoints,autoRenew,status}} })
      return NextResponse.json({ id }, { status:201 })
    }
    return NextResponse.json({ error: 'Unsupported business action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update business suite'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 400 })
  }
}
