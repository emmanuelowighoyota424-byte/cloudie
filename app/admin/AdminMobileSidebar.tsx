'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const sections = [['Dashboard','/admin'],['Users','/admin/users'],['Vendors','/admin/vendors'],['Marketplace','/admin/marketplace'],['Orders','/admin/orders'],['Disputes','/admin/disputes'],['Wallet & Ledger','/admin/transactions'],['Shipments','/admin/shipments'],['Documents','/admin/documents'],['Business Tenants','/admin/tenants'],['KYC','/admin/kyc'],['Notifications','/admin/notifications'],['Audit Logs','/admin/audit'],['Analytics','/admin/analytics'],['System Health','/admin/system-health'],['Pricing','/admin/pricing'],['Settings','/admin/settings']] as const

export default function AdminMobileSidebar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Open admin sidebar" aria-expanded={open} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background text-lg hover:bg-muted lg:hidden">☰</button>
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button type="button" aria-label="Close admin sidebar" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40" />
          <aside className="relative flex h-full w-[min(88vw,20rem)] flex-col border-r bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-5">
              <div>
                <Link href="/admin" onClick={() => setOpen(false)} className="text-xl font-bold tracking-tight">cloudie<span className="text-primary">.</span></Link>
                <p className="mt-1 text-xs text-muted-foreground">Super Admin Console</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg px-3 py-2 text-xl hover:bg-muted">×</button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-4" aria-label="Mobile admin sidebar navigation">
              {sections.map(([label, href], index) => {
                const active = href === '/admin' ? pathname === href : pathname.startsWith(href)
                return <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${active ? 'bg-primary-foreground/15' : 'bg-muted group-hover:bg-background'}`}>{String(index + 1).padStart(2, '0')}</span>
                  <span>{label}</span>
                </Link>
              })}
            </nav>
            <div className="border-t p-4">
              <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">← Exit Admin</Link>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
