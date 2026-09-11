import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireWorkspaceMember, requireWorkspaceRole } from '@/lib/authorization'

export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    await requireWorkspaceMember(workspaceId)
    const url = new URL(request.url)
    const search = url.searchParams.get('search')?.trim()
    const category = url.searchParams.get('category')?.trim()
    const vendorId = url.searchParams.get('vendorId')?.trim()
    const page = Math.max(1, Number(url.searchParams.get('page') || 1))
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize') || 20)))
    const where = { workspaceId, active: true, ...(vendorId ? { vendorId } : {}), ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { sku: { contains: search, mode: 'insensitive' as const } }] } : {}), ...(category ? { vendor: { category: { equals: category, mode: 'insensitive' as const } } } : {}) }
    const [products, total] = await Promise.all([
      prisma.product.findMany({ where, include: { vendor: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.product.count({ where }),
    ])
    return NextResponse.json({ products, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load marketplace'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    const { user, membership } = await requireWorkspaceRole(workspaceId, ['VENDOR', 'WORKSPACE_ADMIN', 'MANAGER', 'SUPER_ADMIN'])
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const action = body?.action
    if (action === 'vendor') {
      const name = typeof body?.name === 'string' ? body.name.trim() : ''
      const category = typeof body?.category === 'string' ? body.category.trim() : ''
      if (!name || !category) return NextResponse.json({ error: 'Vendor name and category are required' }, { status: 400 })
      const existing = await prisma.vendor.findFirst({ where: { workspaceId, name } })
      if (existing) return NextResponse.json({ vendor: existing })
      const vendor = await prisma.vendor.create({ data: { workspaceId, name, category, status: membership.role === 'VENDOR' ? 'PENDING' : 'APPROVED' } })
      await prisma.auditLog.create({ data: { actorId: user.id, workspaceId, action: 'vendor.created', entity: 'Vendor', entityId: vendor.id, metadata: { status: vendor.status } } })
      return NextResponse.json({ vendor }, { status: 201 })
    }
    if (action === 'product') {
      const name = typeof body?.name === 'string' ? body.name.trim() : ''
      const sku = typeof body?.sku === 'string' ? body.sku.trim() : ''
      const vendorId = typeof body?.vendorId === 'string' ? body.vendorId : null
      const price = Number(body?.price)
      const stock = Number(body?.stock ?? 0)
      if (!name || !sku || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) return NextResponse.json({ error: 'Invalid product fields' }, { status: 400 })
      const vendor = vendorId ? await prisma.vendor.findFirst({ where: { id: vendorId, workspaceId } }) : null
      if (vendorId && !vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
      if (membership.role === 'VENDOR' && (!vendor || vendor.status !== 'APPROVED')) return NextResponse.json({ error: 'Vendor is not approved' }, { status: 403 })
      const product = await prisma.product.create({ data: { workspaceId, vendorId: vendor?.id, name, sku, description: typeof body?.description === 'string' ? body.description.trim() : null, price, stock, active: true } })
      await prisma.auditLog.create({ data: { actorId: user.id, workspaceId, action: 'product.created', entity: 'Product', entityId: product.id, metadata: { sku, vendorId: vendor?.id ?? null } } })
      return NextResponse.json({ product }, { status: 201 })
    }
    return NextResponse.json({ error: 'Unsupported marketplace action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update marketplace'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}
