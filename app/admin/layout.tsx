import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireSuperAdmin } from '@/lib/authorization'

const sections = [['Dashboard','/admin'],['Users','/admin/users'],['Vendors','/admin/vendors'],['Marketplace','/admin/marketplace'],['Orders','/admin/orders'],['Disputes','/admin/disputes'],['Wallet & Ledger','/admin/transactions'],['Shipments','/admin/shipments'],['Documents','/admin/documents'],['Business Tenants','/admin/tenants'],['KYC','/admin/kyc'],['Notifications','/admin/notifications'],['Audit Logs','/admin/audit'],['Analytics','/admin/analytics'],['System Health','/admin/system-health'],['Pricing','/admin/pricing'],['Settings','/admin/settings']]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try { await requireSuperAdmin() } catch { redirect('/admin/login') }
  return <div className="min-h-screen bg-muted/30">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r bg-background lg:flex lg:flex-col">
      <div className="border-b px-6 py-5">
        <Link href="/admin" className="text-xl font-bold tracking-tight">cloudie<span className="text-primary">.</span></Link>
        <p className="mt-1 text-xs text-muted-foreground">Super Admin Console</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-4" aria-label="Admin sidebar navigation">
        {sections.map(([label,href], index)=><Link key={href} href={href} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-semibold group-hover:bg-background">{String(index + 1).padStart(2,'0')}</span>
          <span>{label}</span>
        </Link>)}
      </nav>
      <div className="border-t p-4">
        <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">← Exit Admin</Link>
      </div>
    </aside>
    <div className="lg:pl-72">
      <header className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="font-semibold lg:hidden shrink-0">cloudie.</Link>
          <nav className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 lg:hidden" aria-label="Admin navigation">{sections.map(([label,href])=><Link key={href} href={href} className="whitespace-nowrap rounded-full border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">{label}</Link>)}</nav>
          <form action="/admin" className="hidden flex-1 sm:block"><input name="q" placeholder="Search authorized resources…" className="h-10 w-full max-w-xl rounded-lg border bg-muted/40 px-3 text-sm" /></form>
        </div>
      </header>
      <main className="p-4 sm:p-6">{children}</main>
    </div>
  </div>
}