import { POST as sendEmail } from '@/app/api/workspaces/[workspaceId]/email/route'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : ''
  if (!workspaceId) return Response.json({ error: 'workspaceId is required' }, { status: 400 })
  const forwarded = new Request(request.url, { method:'POST', headers:request.headers, body:JSON.stringify(body) })
  return sendEmail(forwarded, { params: Promise.resolve({ workspaceId }) })
}
