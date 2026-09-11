import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isAuthorizationError, requireUser } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(60),
})

export async function GET() {
  try {
    const user = await requireUser()
    const memberships = await prisma.workspaceMembership.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        workspace: { select: { id: true, name: true, slug: true, createdAt: true } },
      },
    })

    return NextResponse.json({ workspaces: memberships })
  } catch (error) {
    if (isAuthorizationError(error)) {
      return NextResponse.json({ error: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 'Unauthorized' : 'Forbidden' }, { status: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 403 })
    }
    console.error('GET /api/workspaces failed', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const input = createWorkspaceSchema.parse(await request.json())

    const workspace = await prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({ data: input })
      await tx.workspaceMembership.create({
        data: { workspaceId: created.id, userId: user.id, role: 'OWNER' },
      })
      await tx.auditLog.create({
        data: {
          userId: user.id,
          workspaceId: created.id,
          action: 'WORKSPACE_CREATED',
          entity: 'Workspace',
          entityId: created.id,
          metadata: { slug: created.slug },
        },
      })
      return created
    })

    return NextResponse.json({ workspace }, { status: 201 })
  } catch (error) {
    if (isAuthorizationError(error)) {
      return NextResponse.json({ error: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 'Unauthorized' : 'Forbidden' }, { status: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 403 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid workspace payload', issues: error.issues }, { status: 400 })
    }
    console.error('POST /api/workspaces failed', error)
    return NextResponse.json({ error: 'Unable to create workspace' }, { status: 500 })
  }
}
