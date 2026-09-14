import Link from 'next/link'
import { requireUser } from '@/lib/authorization'

const items = [
  ['Overview','/dashboard'], ['Wallet','/dashboard/wallet'], ['Transactions','/dashboard/transactions'], ['Orders','/dashboard/orders'], ['Crypto','/dashboard/crypto'], ['Referrals','/dashboard/referrals'], ['Notifications','/dashboard/notifications'], ['Documents','/dashboard/documents'], ['Profile & Security','/dashboard/profile'],
  ['Shipments','/customer'], ['Ticketing','/ticketing'], ['Business Suite','/business'], ['Services','/services'], ['Marketplace','/marketplace'],
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return <div className="min-h-screen bg-muted/30">
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="font-semibold tracking-tight">cloudie.</Link>
        <div className="text-right text-xs text-muted-foreground"><div>{user.name}</div><div>{user.email}</div></div>
      </div>
    </header>
    <div className="mx-auto grid max-w-7xl lg:grid-cols-[220px_1fr]">
      <aside className="hidden border-r bg-background/70 p-3 lg:block"><nav className="sticky top-20 space-y-1">{items.map(([label,href]) => <Link key={href} href={href} className="block rounded-lg px-3 py-2 text-sm hover:bg-muted">{label}</Link>)}</nav></aside>
      <main className="min-w-0 p-4 sm:p-6">{children}</main>
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-2 backdrop-blur lg:hidden"><div className="flex gap-1 overflow-x-auto">{items.slice(0,8).map(([label,href]) => <Link key={href} href={href} className="shrink-0 rounded-lg px-3 py-2 text-xs hover:bg-muted">{label}</Link>)}</div></nav>
  </div>
}
