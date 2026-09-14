import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, Bell, Building2, ChevronRight, CircleHelp, FileText, Grid2X2, Package, Plane, Plus, Sparkles, Truck, WalletCards } from 'lucide-react'

const nav = [
  ['Marketplace', '/marketplace'], ['Orders', '/dashboard/orders'], ['Buy with Crypto', '/dashboard/crypto'], ['Transactions', '/dashboard/transactions'], ['Become Vendor', '/vendor'], ['Referrals', '/dashboard/referrals'], ['Support', '/support'],
]

export function DashboardHeader({ points, unread, userName }: { points: number; unread: number; userName: string }) {
  return <header className="border-b bg-background/85 backdrop-blur-xl">
    <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
      <Link href="/dashboard" className="mr-2 shrink-0 text-xl font-black tracking-[-0.04em]">cloudie<span className="text-muted-foreground">.</span></Link>
      <nav className="hidden min-w-0 flex-1 items-center gap-1 xl:flex">{nav.map(([label, href]) => <Link key={href} href={href} className="rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">{label}</Link>)}</nav>
      <div className="ml-auto flex items-center gap-2">
        <Link href="/dashboard/wallet" className="hidden rounded-xl border bg-muted/40 px-3 py-2 text-xs font-semibold sm:block">{points.toLocaleString()} pts</Link>
        <Link href="/dashboard/notifications" aria-label={`${unread} unread notifications`} className="relative inline-flex size-9 items-center justify-center rounded-xl border hover:bg-muted"><Bell className="size-4" />{unread > 0 && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-foreground" />}</Link>
        <Link href="/dashboard/profile" className="inline-flex size-9 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground" aria-label={`Open profile for ${userName}`}>{userName.slice(0, 1).toUpperCase()}</Link>
      </div>
    </div>
  </header>
}

export function PointsHero({ balance }: { balance: number }) {
  return <section className="relative overflow-hidden rounded-[28px] border bg-card p-6 shadow-sm sm:p-8">
    <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-primary/5 blur-3xl" />
    <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><WalletCards className="size-4" /> Available Points</div><p className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">{balance.toLocaleString()}</p><p className="mt-2 text-sm text-muted-foreground">Your Cloudie wallet is ready for purchases, services and eligible rewards.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/dashboard/wallet" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="size-4" /> Buy Points</Link><Link href="/dashboard/wallet" className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-muted">Guide</Link><Link href="/support" className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-muted"><CircleHelp className="size-4" /> Get Help</Link></div>
    </div>
  </section>
}

export function StatCard({ label, value, icon, href }: { label: string; value: number; icon: React.ReactNode; href: string }) {
  return <Link href={href} className="group rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-center justify-between"><span className="rounded-xl border bg-muted/40 p-2.5">{icon}</span><ChevronRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" /></div><p className="mt-5 text-2xl font-semibold tracking-tight">{value.toLocaleString()}</p><p className="mt-1 text-sm text-muted-foreground">{label}</p></Link>
}

const workspaces = [
  { title: 'Shipment Workspace', description: 'Create, manage and track shipments.', href: '/shipments', icon: <Truck className="size-5" />, actions: [['Create shipment', '/shipments/new'], ['Track shipment', '/track/'], ['View shipments', '/shipments']] },
  { title: 'Ticketing Workspace', description: 'Search and manage flights, hotels and travel bookings.', href: '/ticketing', icon: <Plane className="size-5" />, actions: [['Search flights', '/ticketing'], ['Search hotels', '/ticketing'], ['My bookings', '/ticketing/bookings']] },
  { title: 'Business Suite', description: 'Manage business operations and micro-applications.', href: '/business', icon: <Building2 className="size-5" />, actions: [['Business dashboard', '/business'], ['Departments', '/business/departments'], ['Invoices', '/business/invoices']] },
  { title: 'Services', description: 'Access Cloudie digital services and assets.', href: '/services', icon: <Sparkles className="size-5" />, actions: [['Digital services', '/services'], ['Assets', '/services/assets'], ['Documents', '/dashboard/documents']] },
]

export function WorkspaceGrid() {
  return <section><div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workspaces</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Everything connected</h2></div></div><div className="grid gap-4 md:grid-cols-2">{workspaces.map((workspace) => <article key={workspace.title} className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div className="rounded-xl border bg-muted/40 p-3">{workspace.icon}</div><Link href={workspace.href} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Open <ChevronRight className="ml-1 inline size-3" /></Link></div><h3 className="mt-5 font-semibold">{workspace.title}</h3><p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{workspace.description}</p><div className="mt-5 flex flex-wrap gap-2">{workspace.actions.map(([label, href]) => <Link key={label} href={href} className="rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">{label}</Link>)}</div></article>)}</div></section>
}

export function ActivityPanel({ transactions }: { transactions: Array<{ id: string; amount: number; description: string; reference: string | null; createdAt: Date; balance: number }> }) {
  return <section className="rounded-2xl border bg-card p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Wallet</p><h2 className="mt-1 font-semibold">Recent activity</h2></div><Link href="/dashboard/transactions" className="text-xs font-semibold text-muted-foreground hover:text-foreground">View all</Link></div><div className="divide-y">{transactions.length ? transactions.map((item) => { const credit = item.amount >= 0; return <div key={item.id} className="flex items-center gap-3 py-3"><span className={`rounded-full p-2 ${credit ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>{credit ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.description}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{item.reference ?? 'No reference'} · {item.createdAt.toLocaleDateString()}</p></div><div className="text-right"><p className={`text-sm font-semibold ${credit ? 'text-emerald-600' : 'text-red-600'}`}>{credit ? '+' : ''}{item.amount.toLocaleString()}</p><p className="text-[11px] text-muted-foreground">Balance {item.balance.toLocaleString()}</p></div></div> }) : <div className="rounded-xl border border-dashed p-8 text-center"><WalletCards className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No point transactions yet</p><p className="mt-1 text-xs text-muted-foreground">Your wallet activity will appear here.</p></div>}</div></section>
}

export function RecentShipments({ shipments }: { shipments: Array<{ id: string; trackingId: string; origin: string; destination: string; status: string; createdAt: Date }> }) {
  return <section className="rounded-2xl border bg-card p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Logistics</p><h2 className="mt-1 font-semibold">Recent shipments</h2></div><Link href="/shipments" className="text-xs font-semibold text-muted-foreground hover:text-foreground">View all</Link></div>{shipments.length ? <div className="space-y-2">{shipments.map((shipment) => <Link key={shipment.id} href={`/track/${encodeURIComponent(shipment.trackingId)}`} className="flex items-center gap-3 rounded-xl border p-3 transition hover:bg-muted/40"><span className="rounded-lg bg-muted p-2"><Package className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{shipment.trackingId}</p><p className="truncate text-xs text-muted-foreground">{shipment.origin} → {shipment.destination}</p></div><span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold">{shipment.status.replaceAll('_', ' ')}</span></Link>)}</div> : <div className="rounded-xl border border-dashed p-8 text-center"><Package className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No shipments yet</p><p className="mt-1 text-xs text-muted-foreground">Create your first shipment and track it from this workspace.</p><Link href="/shipments/new" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Create shipment</Link></div>}</section>
}

export function QuickLinks() {
  return <div className="grid gap-3 sm:grid-cols-3"><Link href="/marketplace" className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm font-semibold shadow-sm hover:bg-muted/40"><Grid2X2 className="size-4" /> Marketplace <ChevronRight className="ml-auto size-4 text-muted-foreground" /></Link><Link href="/dashboard/documents" className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm font-semibold shadow-sm hover:bg-muted/40"><FileText className="size-4" /> Documents <ChevronRight className="ml-auto size-4 text-muted-foreground" /></Link><Link href="/support" className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm font-semibold shadow-sm hover:bg-muted/40"><CircleHelp className="size-4" /> Support <ChevronRight className="ml-auto size-4 text-muted-foreground" /></Link></div>
}
