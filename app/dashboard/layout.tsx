import Link from 'next/link'
import { Bell, Boxes, CreditCard, FileText, Home, LifeBuoy, Package, ShoppingBag, Ticket, UserRound, WalletCards, type LucideIcon } from 'lucide-react'
import { requireUser } from '@/lib/authorization'
import { getPointBalance } from '@/lib/points'
import { prisma } from '@/lib/prisma'
import RealtimeBridge from './RealtimeBridge'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import ReferralAttribution from './ReferralAttribution'
import { DashboardHeader } from '@/components/cloudie/dashboard-ui'
import { ThemeToggle } from '@/components/cloudie/theme-toggle'

type NavItem = [label: string, href: string, icon: LucideIcon]

const personalItems: NavItem[] = [
  ['Overview', '/dashboard', Home], ['Wallet / Points', '/dashboard/wallet', WalletCards], ['Transactions', '/dashboard/transactions', CreditCard], ['Orders', '/dashboard/orders', ShoppingBag], ['Crypto', '/dashboard/crypto', Boxes], ['Referrals', '/dashboard/referrals', UserRound], ['Notifications', '/dashboard/notifications', Bell], ['Documents', '/dashboard/documents', FileText], ['Profile & Security', '/dashboard/profile', UserRound],
]
const workspaceItems: NavItem[] = [
  ['Shipments', '/shipments', Package], ['Ticketing', '/ticketing', Ticket], ['Business Suite', '/business', Boxes], ['Services', '/services', Boxes], ['Marketplace', '/marketplace', ShoppingBag],
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const [points, unread] = await Promise.all([
    getPointBalance(user.id),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ])

  return <div className="min-h-screen bg-background">
    <RealtimeBridge />
    <ReferralAttribution />
    <div className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-xl"><DashboardHeader points={points} unread={unread} userName={user.name} /></div>
    <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="hidden border-r bg-muted/10 lg:block"><nav className="sticky top-[61px] max-h-[calc(100vh-61px)] space-y-1 overflow-y-auto p-3">
        <p className="px-3 pb-2 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Personal</p>
        {personalItems.map(([label, href, Icon]) => <Link key={href} href={href} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"><Icon className="size-4" />{label}</Link>)}
        <p className="px-3 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Workspaces</p>
        {workspaceItems.map(([label, href, Icon]) => <Link key={href} href={href} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"><Icon className="size-4" />{label}</Link>)}
        <div className="mt-6 border-t pt-4"><WorkspaceSwitcher /></div>
        <div className="mt-3 flex items-center justify-between px-2"><span className="text-xs text-muted-foreground">Appearance</span><ThemeToggle /></div>
        <Link href="/support" className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><LifeBuoy className="size-4" />Support</Link>
      </nav></aside>
      <main className="min-w-0 p-4 pb-24 sm:p-6 sm:pb-8 lg:p-8">{children}</main>
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden"><div className="mx-auto grid max-w-lg grid-cols-5 gap-1">{[
      ['Home', '/dashboard', Home], ['Shipments', '/shipments', Package], ['Wallet', '/dashboard/wallet', WalletCards], ['Marketplace', '/marketplace', ShoppingBag], ['More', '/dashboard/profile', UserRound],
    ].map(([label, href, Icon]: NavItem) => <Link key={href} href={href} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"><Icon className="size-4" />{label}</Link>)}</div></nav>
  </div>
}
