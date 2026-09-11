import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  try { await requireSuperAdmin() } catch { redirect('/dashboard') }

  const [users, workspaces, members, shipments, orders, auditLogs] = await Promise.all([
    prisma.user.count(),
    prisma.workspace.count(),
    prisma.workspaceMember.count(),
    prisma.shipment.count(),
    prisma.order.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, action: true, entity: true, entityId: true, result: true, createdAt: true, workspaceId: true, actorId: true } }),
  ])

  return <main className="min-h-screen bg-muted/40 px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><div><p className="text-sm text-muted-foreground">Platform administration</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Cloudie Admin</h1><p className="mt-2 text-sm text-muted-foreground">Server-authorized operational visibility across the platform.</p></div><div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[['Users', users], ['Workspaces', workspaces], ['Memberships', members], ['Shipments', shipments], ['Orders', orders]].map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-card p-5 shadow-sm"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div><section className="mt-8 rounded-2xl border bg-card shadow-sm"><div className="border-b p-5"><h2 className="font-semibold">Recent audit activity</h2><p className="mt-1 text-sm text-muted-foreground">Sensitive operations recorded by the application.</p></div><div className="divide-y">{auditLogs.length ? auditLogs.map((log) => <div key={log.id} className="grid gap-1 p-5 text-sm sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-medium">{log.action}</p><p className="text-xs text-muted-foreground">{log.entity}{log.entityId ? ` · ${log.entityId}` : ''}{log.workspaceId ? ` · workspace ${log.workspaceId}` : ''}</p></div><span className="text-xs text-muted-foreground">{log.createdAt.toLocaleString()}</span></div>) : <div className="p-8 text-center text-sm text-muted-foreground">No audit events yet.</div>}</div></section></div></main>
}
