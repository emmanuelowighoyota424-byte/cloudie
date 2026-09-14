import Link from 'next/link'
import { requireUser } from '@/lib/authorization'
import { getPointBalance } from '@/lib/points'
import RealtimeBridge from './RealtimeBridge'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import ReferralAttribution from './ReferralAttribution'

const personalItems = [
  ['Overview', '/dashboard'], ['Wallet / Points', '/dashboard/wallet'], ['Transactions', '/dashboard/transactions'], ['Orders', '/dashboard/orders'], ['Crypto', '/dashboard/crypto'], ['Referrals', '/dashboard/referrals'], ['Notifications', '/dashboard/notifications'], ['Documents', '/dashboard/documents'], ['Profile & Security', '/dashboard/profile'],
]
const workspaceItems = [
  ['Shipments', '/shipments'], ['Ticketing', '/ticketing'], ['Business Suite', '/business'], ['Services', '/services'], ['Marketplace', '/marketplace'],
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const points = await getPointBalance(user.id)
  return <div className="min-h-screen bg-muted/30">
    <RealtimeBridge />
    <ReferralAttribution />
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="font-semibold tracking-tight">cloudie.</Link>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link href="/dashboard/wallet" aria-label="Points balance" className="rounded-lg border bg-background px-3 py-2 text-xs font-semibold shadow-sm">Points: {points.toLocaleString()}</Link>
          <WorkspaceSwitcher />
          <div className="hidden text-right text-xs text-muted-foreground sm:block"><div>{user.name}</div><div>{user.email}</div></div>
        </div>
      </div>
    </header>
    <div className="mx-auto grid max-w-7xl lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r bg-background/70 p-3 lg:block"><nav className="sticky top-20 space-y-1">
        <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Personal</p>
        {personalItems.map(([label, href]) => <Link key={href} href={href} className="block rounded-lg px-3 py-2 text-sm hover:bg-muted">{label}</Link>)}
        <p className="px-3 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Workspaces</p>
        {workspaceItems.map(([label, href]) => <Link key={href} href={href} className="block rounded-lg px-3 py-2 text-sm hover:bg-muted">{label}</Link>)}
      </nav></aside>
      <main className="min-w-0 p-4 pb-20 sm:p-6 sm:pb-6">{children}</main>
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-2 backdrop-blur lg:hidden"><div className="flex gap-1 overflow-x-auto">
      {[...personalItems.slice(0,4), ...workspaceItems].map(([label, href]) => <Link key={href} href={href} className="shrink-0 rounded-lg px-3 py-2 text-xs hover:bg-muted">{label}</Link>)}
    </div></nav>
  </div>
}
