'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Menu, X, LogOut } from 'lucide-react'

const sections = [
  ['Dashboard','/admin'],['Users','/admin/users'],['Vendors','/admin/vendors'],['Marketplace','/admin/marketplace'],['Orders','/admin/orders'],['Disputes','/admin/disputes'],['Wallet & Ledger','/admin/transactions'],['Shipments','/admin/shipments'],['Documents','/admin/documents'],['Business Tenants','/admin/tenants'],['KYC','/admin/kyc'],['Notifications','/admin/notifications'],['Audit Logs','/admin/audit'],['Analytics','/admin/analytics'],['System Health','/admin/system-health'],['Pricing','/admin/pricing'],['Settings','/admin/settings'],
] as const

export default function AdminSidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Open admin navigation" className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg border bg-background shadow-sm hover:bg-muted"><Menu className="h-5 w-5" /></button>
    {open && <button type="button" aria-label="Close admin navigation" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r bg-background shadow-xl transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[73px] items-center justify-between border-b px-5"><Link href="/admin" className="text-xl font-bold tracking-tight" aria-label="Cloudie Super Admin">cloudie<span className="text-primary">.</span></Link><button type="button" onClick={() => setOpen(false)} aria-label="Close admin navigation" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"><X className="h-5 w-5" /></button></div>
      <div className="px-5 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Super Admin Console</div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Admin sidebar navigation">
        {sections.map(([label, href], index) => { const active = href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${active ? 'bg-primary-foreground/15' : 'bg-muted group-hover:bg-background'}`}>{String(index + 1).padStart(2,'0')}</span><span className="truncate">{label}</span></Link> })}
      </nav>
      <div className="border-t p-3"><Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut className="h-4 w-4" /><span>Exit Admin</span></Link></div>
    </aside>
  </>
}
