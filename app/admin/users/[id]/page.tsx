import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/authorization'
import UserControls from './UserControls'

export const dynamic = 'force-dynamic'

export default async function UserAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin()
  const { id } = await params
  const u = await prisma.user.findUnique({ where: { id }, include: { pointLedger: { orderBy: { createdAt: 'desc' }, take: 25 }, sessions: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, createdAt: true, expiresAt: true, ipAddress: true, userAgent: true } }, shipmentsCreated: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, trackingId: true, status: true, createdAt: true } }, orders: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, status: true, total: true, createdAt: true } }, auditActorLogs: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, action: true, entity: true, entityId: true, result: true, createdAt: true } } } })
  if (!u) notFound()
  const balance = u.pointLedger[0]?.balance ?? 0

  return <div className="mx-auto max-w-6xl space-y-6">
    <div><p className="text-sm text-muted-foreground">User administration</p><h1 className="text-2xl font-semibold">{u.name}</h1><p className="text-sm text-muted-foreground">{u.email} · {u.id}</p></div>
    <div className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl border bg-background p-4"><p className="text-xs text-muted-foreground">Role</p><p className="mt-1 font-semibold">{u.role}</p></div><div className="rounded-xl border bg-background p-4"><p className="text-xs text-muted-foreground">Status</p><p className="mt-1 font-semibold">{u.suspendedAt ? 'SUSPENDED' : 'ACTIVE'}</p></div><div className="rounded-xl border bg-background p-4"><p className="text-xs text-muted-foreground">Points balance</p><p className="mt-1 font-semibold">{balance.toLocaleString()}</p></div><div className="rounded-xl border bg-background p-4"><p className="text-xs text-muted-foreground">Joined</p><p className="mt-1 font-semibold">{u.createdAt.toLocaleDateString()}</p></div></div>
    <UserControls userId={u.id} suspended={Boolean(u.suspendedAt)} role={u.role} />
    <section className="rounded-xl border bg-background"><div className="border-b p-4"><h2 className="font-semibold">Point ledger</h2></div><div className="divide-y">{u.pointLedger.map(x => <div key={x.id} className="grid grid-cols-3 gap-3 p-4 text-sm"><span>{x.description}</span><span>{x.amount > 0 ? '+' : ''}{x.amount}</span><span className="text-right text-muted-foreground">balance {x.balance} · {x.createdAt.toLocaleString()}</span></div>)}</div>{!u.pointLedger.length && <div className="p-6 text-sm text-muted-foreground">No point ledger entries.</div>}</section>
    <section className="rounded-xl border bg-background"><div className="border-b p-4"><h2 className="font-semibold">Security & audit activity</h2></div><div className="divide-y">{u.auditActorLogs.map(x => <div key={x.id} className="p-4 text-sm"><b>{x.action}</b> · {x.entity}{x.entityId ? `/${x.entityId}` : ''}<span className="float-right text-xs text-muted-foreground">{x.createdAt.toLocaleString()}</span></div>)}</div>{!u.auditActorLogs.length && <div className="p-6 text-sm text-muted-foreground">No audit activity.</div>}</section>
  </div>
}
