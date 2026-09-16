import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/authorization'
import { getPointBalance, getPointLedger } from '@/lib/points'
import { ActivityPanel, PointsHero, QuickLinks, RecentShipments, StatCard, WorkspaceGrid } from '@/components/cloudie/dashboard-ui'
import { ArrowUpRight, CheckCircle2, Package, Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await requireUser()
  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)

  const [balance, ledger, activeShipments, completedShipments, referrals, monthlyTransactions, shipments] = await Promise.all([
    getPointBalance(user.id),
    getPointLedger(user.id, { take: 8 }),
    prisma.shipment.count({ where: { creatorId: user.id, status: { in: ['PENDING', 'CONFIRMED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] } } }),
    prisma.shipment.count({ where: { creatorId: user.id, status: 'DELIVERED' } }),
    prisma.referral.count({ where: { userId: user.id } }),
    prisma.pointLedger.count({ where: { userId: user.id, createdAt: { gte: startOfMonth } } }),
    prisma.shipment.findMany({ where: { creatorId: user.id }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, trackingId: true, origin: true, destination: true, status: true, createdAt: true } }),
  ])

  return <div className="mx-auto max-w-[1500px] space-y-8">
    <section className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-medium text-muted-foreground">Personal workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Good to see you, {user.name.split(' ')[0]}.</h1><p className="mt-2 text-sm text-muted-foreground">A clear view of your wallet, shipments and Cloudie activity.</p></div>
      <p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat('en', { dateStyle: 'full' }).format(new Date())}</p>
    </section>

    <PointsHero balance={balance} />

    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Active shipments" value={activeShipments} href="/shipments" icon={<Package className="size-4" />} />
      <StatCard label="Completed shipments" value={completedShipments} href="/shipments?status=DELIVERED" icon={<CheckCircle2 className="size-4" />} />
      <StatCard label="Referrals" value={referrals} href="/dashboard/referrals" icon={<Users className="size-4" />} />
      <StatCard label="Monthly transactions" value={monthlyTransactions} href="/dashboard/transactions" icon={<ArrowUpRight className="size-4" />} />
    </section>

    <WorkspaceGrid />

    <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
      <ActivityPanel transactions={ledger.map((item) => ({ ...item, amount: Number(item.amount), balance: Number(item.balance) }))} />
      <RecentShipments shipments={shipments} />
    </section>

    <QuickLinks />
  </div>
}
