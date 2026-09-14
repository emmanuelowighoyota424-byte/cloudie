import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authorization'
import { getActionPrice } from '@/lib/billing'

export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params
    await requirePermission(workspaceId, 'billing.read')
    const action = new URL(request.url).searchParams.get('action')?.trim()
    if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 })
    const price = await getActionPrice({ workspaceId, action })
    return NextResponse.json(price)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load price'
    return NextResponse.json({ error: message }, { status: message.includes('Authentication') ? 401 : message.includes('access') || message.includes('permissions') ? 403 : 500 })
  }
}
