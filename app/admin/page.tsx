import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const admin = await requireSuperAdmin()
  const [users, activeUsers, suspendedUsers, vendors, shipments, deliveredShipments, documents, workspaces, orders, disputes, pendingKyc, points, failedRows] = await Promise.all([
    prisma.user.count(), prisma.user.count({ where: { suspendedAt: null } }), prisma.user.count({ where: { suspendedAt: { not: null } } }),
    prisma.vendor.count(), prisma.shipment.count({ where: { status: { notIn: ['DELIVERED','CANCELLED'] } } }), prisma.shipment.count({ where: { status: 'DELIVERED' } }),
    prisma.document.count(), prisma.workspace.count(), prisma.order.count(), prisma.auditLog.count({ where: { action: { contains: 'DISPUTE' } } }),
    prisma.kYCVerification.count({ where: { status: { in: ['PENDING','UNDER_REVIEW'] } } }), prisma.pointLedger.aggregate({ _sum: { amount: true } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "CloudieJob" WHERE status = 'FAILED'`,
  ])
  const failedJobs = Number(failedRows[0]?.count ?? 0)
  const recent = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 12, select: { id:true,action:true,entity:true,entityId:true,result:true,createdAt:true,actorId:true } })
  const cards = [['Total Users',users],['Active Users',activeUsers],['Suspended Users',suspendedUsers],['Vendors',vendors],['Active Shipments',shipments],['Delivered',deliveredShipments],['Documents',documents],['Tenants',workspaces],['Orders',orders],['Pending KYC',pendingKyc],['Failed Jobs',failedJobs],['Net Points',points._sum.amount ?? 0]]
  return <div className="mx-auto max-w-7xl"><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm text-muted-foreground">Platform administration</p><h1 className="text-3xl font-semibold tracking-tight">Super Admin Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Live PostgreSQL-backed operational metrics for {admin.email}.</p></div><div className="rounded-full border bg-background px-3 py-1 text-xs">Server-authorized</div></div><div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value])=><div key={String(label)} className="rounded-xl border bg-background p-5 shadow-sm"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{Number(value).toLocaleString()}</p></div>)}</div><section className="mt-7 rounded-2xl border bg-background shadow-sm"><div className="border-b p-5"><h2 className="font-semibold">Recent audit activity</h2><p className="mt-1 text-sm text-muted-foreground">Privileged operations recorded by the server.</p></div><div className="divide-y">{recent.length ? recent.map(log=><div key={log.id} className="grid gap-1 p-4 sm:grid-cols-[1fr_auto]"><div><p className="font-medium">{log.action}</p><p className="text-xs text-muted-foreground">{log.entity}{log.entityId ? ` · ${log.entityId}` : ''}{log.actorId ? ` · actor ${log.actorId}` : ''}</p></div><div className="text-xs text-muted-foreground">{log.result} · {log.createdAt.toLocaleString()}</div></div>) : <div className="p-8 text-center text-sm text-muted-foreground">No audit events yet.</div>}</div></section></div>
}
