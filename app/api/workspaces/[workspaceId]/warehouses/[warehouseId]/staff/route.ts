import { NextResponse } from 'next/server'
import { WorkspaceRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireWorkspaceRole } from '@/lib/authorization'

export async function GET(_: Request, context: { params: Promise<{ workspaceId: string; warehouseId: string }> }) {
  try {
    const { workspaceId, warehouseId } = await context.params
    await requireWorkspaceRole(workspaceId, ['SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER'] as WorkspaceRole[])
    const warehouse = await prisma.warehouse.findFirst({ where: { id: warehouseId, workspaceId }, select: { id: true, name: true } })
    if (!warehouse) return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 })
    const assignments = await prisma.warehouseStaffAssignment.findMany({ where: { workspaceId, warehouseId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } })
    return NextResponse.json({ warehouse, assignments })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load warehouse staff'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : 403 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string; warehouseId: string }> }) {
  try {
    const { workspaceId, warehouseId } = await context.params
    const { user } = await requireWorkspaceRole(workspaceId, ['SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER'] as WorkspaceRole[])
    const body = await request.json().catch(() => null)
    const userId = typeof body?.userId === 'string' ? body.userId : ''
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    const [warehouse, member] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id: warehouseId, workspaceId, status: 'ACTIVE' }, select: { id: true } }),
      prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { userId: true, role: true, status: true } }),
    ])
    if (!warehouse) return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 })
    if (!member || member.status !== 'ACTIVE' || member.role !== 'WAREHOUSE_STAFF') return NextResponse.json({ error: 'User must be an active warehouse staff member in this workspace' }, { status: 400 })
    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.warehouseStaffAssignment.upsert({ where: { warehouseId_userId: { warehouseId, userId } }, create: { workspaceId, warehouseId, userId }, update: {} })
      await tx.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'warehouse.staff_assigned', entity: 'WarehouseStaffAssignment', entityId: created.id, result: 'SUCCESS', metadata: { warehouseId, userId } } })
      return created
    })
    return NextResponse.json({ assignment }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to assign warehouse staff'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : message.includes('access') || message.includes('permissions') ? 403 : 500 })
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ workspaceId: string; warehouseId: string }> }) {
  try {
    const { workspaceId, warehouseId } = await context.params
    const { user } = await requireWorkspaceRole(workspaceId, ['SUPER_ADMIN', 'WORKSPACE_ADMIN', 'MANAGER'] as WorkspaceRole[])
    const body = await request.json().catch(() => null)
    const userId = typeof body?.userId === 'string' ? body.userId : ''
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    const assignment = await prisma.warehouseStaffAssignment.findFirst({ where: { workspaceId, warehouseId, userId } })
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    await prisma.$transaction(async (tx) => {
      await tx.warehouseStaffAssignment.delete({ where: { id: assignment.id } })
      await tx.auditLog.create({ data: { actorId: user.id, userId: user.id, workspaceId, action: 'warehouse.staff_unassigned', entity: 'WarehouseStaffAssignment', entityId: assignment.id, result: 'SUCCESS', metadata: { warehouseId, userId } } })
    })
    return NextResponse.json({ deleted: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to remove warehouse staff'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : message.includes('access') || message.includes('permissions') ? 403 : 500 })
  }
}
