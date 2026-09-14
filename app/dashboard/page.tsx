import Link from 'next/link'
import { requireUser } from '@/lib/authorization'
import { getPointBalance, getPointLedger } from '@/lib/points'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await requireUser()
  const [balance, ledger, orders, shipments, notifications, documents, referrals, kyc] = await Promise.all([
    getPointBalance(user.id), getPointLedger(user.id, { take: 6 }),
    prisma.order.findMany({ where: { userId: user.id }, include: { items: { include: { product: true } } }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.shipment.findMany({ where: { creatorId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.document.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.referral.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.kYCVerification.findFirst({ where: { userId: user.id }, orderBy: { submittedAt: 'desc' } }),
  ])
  return <div className="space-y-6">
    <div><p className="text-sm text-muted-foreground">Personal workspace</p><h1 className="text-2xl font-semibold">Welcome back, {user.name}</h1></div>
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric title="Points balance" value={balance.toLocaleString()} href="/dashboard/wallet"/><Metric title="Orders" value={String(orders.length)} href="/dashboard/orders"/><Metric title="Shipments" value={String(shipments.length)} href="/customer"/><Metric title="Unread notifications" value={String(notifications.filter(n=>!n.readAt).length)} href="/dashboard/notifications"/></section>
    <section className="grid gap-6 xl:grid-cols-2">
      <Panel title="Recent point activity" href="/dashboard/transactions"><div className="divide-y">{ledger.length?ledger.map(x=><div key={x.id} className="flex justify-between py-3 text-sm"><span>{x.description}<span className="ml-2 text-xs text-muted-foreground">{x.reference??'—'}</span></span><b className={x.amount>=0?'text-emerald-600':'text-red-600'}>{x.amount>=0?'+':''}{x.amount}</b></div>):<Empty text="No point transactions yet."/>}</div></Panel>
      <Panel title="Recent orders" href="/dashboard/orders"><div className="divide-y">{orders.length?orders.map(o=><Link href={`/dashboard/orders/${o.id}`} key={o.id} className="flex justify-between py-3 text-sm hover:bg-muted/50"><span>Order {o.id.slice(-8)}</span><span>{o.status} · {o.total.toString()}</span></Link>):<Empty text="No orders yet."/>}</div></Panel>
      <Panel title="Shipments" href="/customer"><div className="divide-y">{shipments.length?shipments.map(s=><Link href={`/customer?tracking=${encodeURIComponent(s.trackingId)}`} key={s.id} className="flex justify-between py-3 text-sm"><span>{s.trackingId}</span><span>{s.status}</span></Link>):<Empty text="No shipments yet."/>}</div></Panel>
      <Panel title="Account status"><div className="space-y-3 text-sm"><p><span className="text-muted-foreground">Account:</span> Active</p><p><span className="text-muted-foreground">Email verified:</span> {user.emailVerified?'Yes':'No'}</p><p><span className="text-muted-foreground">KYC:</span> {kyc?.status??'Not submitted'}</p><p><span className="text-muted-foreground">Referrals:</span> {referrals.length}</p><p><span className="text-muted-foreground">Documents:</span> {documents.length}</p></div></Panel>
    </section>
  </div>
}
function Metric({title,value,href}:{title:string;value:string;href:string}){return <Link href={href} className="rounded-xl border bg-background p-5 shadow-sm hover:border-foreground/30"><p className="text-xs text-muted-foreground">{title}</p><p className="mt-2 text-2xl font-semibold">{value}</p></Link>}
function Panel({title,href,children}:{title:string;href?:string;children:React.ReactNode}){return <section className="rounded-xl border bg-background p-5 shadow-sm"><div className="mb-3 flex items-center justify-between"><h2 className="font-medium">{title}</h2>{href&&<Link href={href} className="text-xs underline">View all</Link>}</div>{children}</section>}
function Empty({text}:{text:string}){return <p className="py-5 text-sm text-muted-foreground">{text}</p>}
