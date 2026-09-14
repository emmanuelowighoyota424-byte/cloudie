'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react'

const sections = [
  ['Dashboard','/admin'],['Users','/admin/users'],['Vendors','/admin/vendors'],['Marketplace','/admin/marketplace'],['Orders','/admin/orders'],['Disputes','/admin/disputes'],['Wallet & Ledger','/admin/transactions'],['Shipments','/admin/shipments'],['Documents','/admin/documents'],['Business Tenants','/admin/tenants'],['KYC','/admin/kyc'],['Notifications','/admin/notifications'],['Audit Logs','/admin/audit'],['Analytics','/admin/analytics'],['System Health','/admin/system-health'],['Pricing','/admin/pricing'],['Settings','/admin/settings'],
] as const

export default function AdminSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const width = collapsed ? 'w-[72px]' : 'w-64'

  return (
    <aside className={`fixed inset-y-0 left-0 z-40 flex ${width} flex-col border-r bg-background transition-[width] duration-200`}>
      <div className="flex h-[73px] items-center border-b px-3">
        <Link href="/admin" className={`flex min-w-0 items-center ${collapsed ? 'justify-center w-full' : 'gap-2 px-2'}`} aria-label="Cloudie Super Admin">
          <span className="text-xl font-bold tracking-tight">{collapsed ? 'c.' : <>cloudie<span className="text-primary">.</span></>}</span>
        </Link>
        <button type="button" onClick={() => setCollapsed(v => !v)} className="absolute -right-3 top-6 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {!collapsed && <div className="px-5 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Super Admin Console</div>}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Admin sidebar navigation">
        {sections.map(([label, href], index) => {
          const active = href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`)
          return <Link key={href} href={href} title={collapsed ? label : undefined} aria-current={active ? 'page' : undefined} className={`group flex items-center rounded-xl py-2.5 text-sm font-medium transition-colors ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${active ? 'bg-primary-foreground/15' : 'bg-muted group-hover:bg-background'}`}>{String(index + 1).padStart(2,'0')}</span>
            {!collapsed && <span className="truncate">{label}</span>}
          </Link>
        })}
      </nav>

      <div className="border-t p-3">
        <Link href="/" title={collapsed ? 'Exit Admin' : undefined} className={`flex items-center rounded-xl py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'}`}>
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Exit Admin</span>}
        </Link>
      </div>
    </aside>
  )
}
