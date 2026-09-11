import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/authorization'

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
})

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'workspace'
}

export async function GET() {
  try {
    const user = await requireUser()
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { workspace: true },
      orderBy: { workspace: { createdAt: 'asc' } },
    })
    return NextResponse.json({ workspaces: memberships.map(({ workspace, role }) => ({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      plan: workspace.plan,
      role,
    })) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load workspaces'
    const status = message.includes('Authentication') || message.includes('access') || message.includes('suspended') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid workspace name' }, { status: 400 })

    const baseSlug = slugify(parsed.data.name)
    const workspace = await prisma.$transaction(async (tx) => {
      let slug = baseSlug
      for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await tx.workspace.findUnique({ where: { slug } })
        if (!existing) break
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`
      }

      const created = await tx.workspace.create({
        data: {
          name: parsed.data.name,
          slug,
          ownerId: user.id,
          members: { create: { userId: user.id, role: 'WORKSPACE_ADMIN' } },
          subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
        },
      })

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          userId: user.id,
          workspaceId: created.id,
          action: 'workspace.created',
          entity: 'Workspace',
          entityId: created.id,
          result: 'SUCCESS',
        },
      })
      return created
    })

    return NextResponse.json({ workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug } }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create workspace'
    const status = message.includes('Authentication') || message.includes('suspended') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
