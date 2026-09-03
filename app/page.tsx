'use client'

import { useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  Box,
  ChevronDown,
  CircleHelp,
  CreditCard,
  FileText,
  Home,
  LayoutGrid,
  LifeBuoy,
  Menu,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react'

const navGroups = [
  { label: 'Workspace', items: [{ label: 'Overview', icon: Home }, { label: 'Shipments', icon: Truck }, { label: 'Documents', icon: FileText }, { label: 'Wallet', icon: Wallet }] },
  { label: 'Business', items: [{ label: 'Services', icon: LayoutGrid }, { label: 'Customers', icon: Users }, { label: 'Portals', icon: Box }] },
  { label: 'Manage', items: [{ label: 'Notifications', icon: Bell }, { label: 'Settings', icon: Settings }] },
]

const shipments = [
  { id: 'CLD-4829', customer: 'Northstar Labs', route: 'Lagos → London', status: 'In transit', date: 'Today, 09:42', icon: 'NL', tone: 'bg-primary/10 text-primary' },
  { id: 'CLD-4828', customer: 'Kora Supply Co.', route: 'Accra → New York', status: 'Delivered', date: 'Yesterday', icon: 'KS', tone: 'bg-accent/15 text-accent-foreground' },
  { id: 'CLD-4827', customer: 'Mira Studios', route: 'Nairobi → Berlin', status: 'Awaiting pickup', date: 'Aug 28, 14:05', icon: 'MS', tone: 'bg-secondary text-secondary-foreground' },
  { id: 'CLD-4826', customer: 'Pine & Co.', route: 'Abuja → Paris', status: 'Delivered', date: 'Aug 27, 17:20', icon: 'PC', tone: 'bg-primary/10 text-primary' },
]

const activity = [
  ['Shipment CLD-4829 created', 'Northstar Labs', '8 min ago'],
  ['Points earned', '+240 pts · CLD-4828', 'Yesterday'],
  ['Document signed', 'Commercial invoice · CLD-4827', 'Yesterday'],
  ['Wallet topped up', '₦250,000 via bank transfer', 'Aug 28'],
]

export default function Page() {
  const [active, setActive] = useState('Overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [toast, setToast] = useState('')

  const pageTitle = useMemo(() => active === 'Overview' ? 'Good morning, Emmanuel' : active, [active])
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2800) }

  return (
    <main className="min-h-screen bg-muted/40 text-foreground">
      <div className="flex min-h-screen">
        <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-sidebar transition-transform lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex h-20 items-center justify-between border-b border-sidebar-border px-6">
            <button className="flex items-center gap-3" onClick={() => setActive('Overview')} aria-label="Go to Cloudie overview">
              <span className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Sparkles size={18} /></span>
              <span className="font-semibold tracking-tight">cloudie<span className="text-sidebar-primary">.</span></span>
            </button>
            <button className="rounded-lg p-2 text-muted-foreground lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X size={18} /></button>
          </div>
          <div className="flex flex-1 flex-col gap-8 overflow-y-auto p-4">
            <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current workspace</p>
              <button className="mt-3 flex w-full items-center justify-between text-left" aria-label="Switch workspace">
                <span className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">AC</span><span><span className="block text-sm font-medium">Acme Corporation</span><span className="block text-xs text-muted-foreground">Business plan</span></span></span><ChevronDown size={15} className="text-muted-foreground" />
              </button>
            </div>
            {navGroups.map((group) => <div key={group.label}><p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{group.label}</p><nav className="flex flex-col gap-1">{group.items.map((item) => { const Icon = item.icon; return <button key={item.label} onClick={() => { setActive(item.label); setSidebarOpen(false) }} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${active === item.label ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm' : 'text-sidebar-foreground hover:bg-sidebar-accent'}`}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.label === 'Notifications' && <span className="ml-auto grid size-5 place-items-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground">3</span>}</button> })}</nav></div>)}
          </div>
          <div className="border-t border-sidebar-border p-4"><button onClick={() => notify('Help center opened')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"><LifeBuoy size={17} /><span>Help center</span><span className="ml-auto text-xs">⌘?</span></button><div className="mt-3 flex items-center gap-3 rounded-xl bg-sidebar-accent p-3"><span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">EO</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">Emmanuel O.</span><span className="block truncate text-xs text-muted-foreground">Admin</span></span><MoreHorizontal size={16} className="text-muted-foreground" /></div></div>
        </aside>
        {sidebarOpen && <button className="fixed inset-0 z-30 bg-foreground/20 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close navigation overlay" />}

        <section className="min-w-0 flex-1">
          <header className="flex h-20 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur md:px-8">
            <div className="flex items-center gap-3"><button className="rounded-lg p-2 hover:bg-muted lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex"><span>Workspace</span><span>/</span><span className="text-foreground">{active}</span></div><span className="font-semibold md:hidden">{active}</span></div>
            <div className="flex items-center gap-2"><button className={`flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted ${searchOpen ? 'bg-muted' : ''}`} onClick={() => setSearchOpen(!searchOpen)}><Search size={16} /><span className="hidden lg:inline">Search</span><kbd className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] md:inline">⌘ K</kbd></button><div className="relative"><button className="relative rounded-lg p-2.5 hover:bg-muted" onClick={() => setShowNotifications(!showNotifications)} aria-label="View notifications"><Bell size={19} /> <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent" /></button>{showNotifications && <div className="absolute right-0 top-12 z-50 w-72 rounded-xl border border-border bg-popover p-4 shadow-xl"><div className="flex items-center justify-between"><p className="font-semibold">Notifications</p><span className="text-xs text-muted-foreground">3 unread</span></div><div className="mt-4 flex flex-col gap-3">{activity.slice(0, 3).map((item) => <div key={item[0]} className="flex gap-3 border-b border-border pb-3 last:border-0"><span className="mt-1 size-2 rounded-full bg-accent" /><p className="text-xs leading-5"><span className="font-medium">{item[0]}</span><br /><span className="text-muted-foreground">{item[1]}</span></p></div>)}</div></div>}</div><button className="hidden items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted sm:flex"><span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">EO</span><ChevronDown size={14} className="text-muted-foreground" /></button></div>
          </header>

          <div className="mx-auto max-w-[1480px] p-4 md:p-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm text-muted-foreground">Tuesday, September 3, 2026</p><h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{pageTitle}</h1><p className="mt-2 text-sm text-muted-foreground">Here&apos;s what&apos;s happening across your workspace.</p></div><div className="flex gap-2"><button onClick={() => notify('Report export started')} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-medium hover:bg-muted"><ArrowDownToLine size={16} /> Export</button><button onClick={() => notify('Shipment creation started')} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"><Plus size={17} /> New shipment</button></div></div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Wallet} label="Wallet balance" value="₦1,284,500" trend="+12.8%" note="vs. last month" /><Metric icon={Truck} label="Active shipments" value="24" trend="+4" note="this week" /><Metric icon={CreditCard} label="Available points" value="18,420" trend="+2,340" note="earned this month" /><Metric icon={ShieldCheck} label="On-time rate" value="98.6%" trend="+1.4%" note="vs. last month" /></div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]"><section className="rounded-xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border p-5"><div><h2 className="font-semibold">Shipment overview</h2><p className="mt-1 text-xs text-muted-foreground">Your logistics activity over the last 30 days</p></div><button className="text-sm font-medium text-primary hover:underline" onClick={() => setActive('Shipments')}>View all</button></div><div className="p-5"><div className="flex h-40 items-end gap-2 sm:gap-4">{[38,52,44,70,62,78,54,86,68,93,74,88,81,96,84,100,78,92,89,95,86,100,92,97,90,100,94,100,98,100].map((height, i) => <div key={i} className="group flex h-full flex-1 flex-col justify-end gap-2"><div className={`w-full rounded-t-sm transition-all group-hover:bg-accent ${i === 29 ? 'bg-primary' : 'bg-primary/15'}`} style={{ height: `${height}%` }} /></div>)}</div><div className="mt-3 flex justify-between text-[11px] text-muted-foreground"><span>Aug 5</span><span>Aug 12</span><span>Aug 19</span><span>Aug 26</span><span>Sep 3</span></div></div></section><section className="rounded-xl border border-border bg-primary p-5 text-primary-foreground"><div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-xl bg-primary-foreground/15"><Zap size={20} /></span><span className="rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider">Pro tip</span></div><h2 className="mt-8 text-xl font-semibold leading-tight">Automate your shipping workflow</h2><p className="mt-3 text-sm leading-6 text-primary-foreground/70">Connect your store or ERP to create shipments, sync tracking, and keep customers informed automatically.</p><button onClick={() => notify('Integration catalog opened')} className="mt-7 inline-flex items-center gap-2 rounded-lg bg-primary-foreground px-3.5 py-2.5 text-sm font-semibold text-primary hover:bg-primary-foreground/90">Explore integrations <ArrowUpRight size={16} /></button></section></div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]"><section className="rounded-xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border p-5"><div><h2 className="font-semibold">Recent shipments</h2><p className="mt-1 text-xs text-muted-foreground">Latest activity from your workspace</p></div><button className="rounded-lg p-2 hover:bg-muted" aria-label="Shipment options"><MoreHorizontal size={18} /></button></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Shipment</th><th className="px-5 py-3 font-medium">Route</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Updated</th></tr></thead><tbody>{shipments.map((shipment) => <tr key={shipment.id} className="border-b border-border last:border-0 hover:bg-muted/50"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className={`grid size-9 place-items-center rounded-lg text-[10px] font-bold ${shipment.tone}`}>{shipment.icon}</span><span><span className="block font-medium">{shipment.customer}</span><span className="block text-xs text-muted-foreground">{shipment.id}</span></span></div></td><td className="px-5 py-4 text-muted-foreground">{shipment.route}</td><td className="px-5 py-4"><Status label={shipment.status} /></td><td className="px-5 py-4 text-xs text-muted-foreground">{shipment.date}</td></tr>)}</tbody></table></div></section><section className="rounded-xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border p-5"><div><h2 className="font-semibold">Activity</h2><p className="mt-1 text-xs text-muted-foreground">Recent workspace events</p></div><button className="text-sm font-medium text-primary hover:underline" onClick={() => setActive('Notifications')}>See all</button></div><div className="flex flex-col gap-5 p-5">{activity.map((item, i) => <div key={item[0]} className="flex gap-3"><span className={`mt-1 grid size-8 shrink-0 place-items-center rounded-full ${i % 2 === 0 ? 'bg-primary/10 text-primary' : 'bg-accent/15 text-accent-foreground'}`}>{i === 0 ? <Package size={14} /> : i === 1 ? <Sparkles size={14} /> : i === 2 ? <FileText size={14} /> : <Wallet size={14} />}</span><div className="min-w-0"><p className="text-sm font-medium">{item[0]}</p><p className="truncate text-xs text-muted-foreground">{item[1]}</p><p className="mt-1 text-[11px] text-muted-foreground">{item[2]}</p></div></div>)}</div></section></div>

            <div className="mt-6 grid gap-4 md:grid-cols-3"><QuickAction icon={FileText} title="Create a document" text="Generate invoices, labels, and customs docs" onClick={() => setActive('Documents')} /><QuickAction icon={Users} title="Invite your team" text="Collaborate with teammates and partners" onClick={() => notify('Invite link copied')} /><QuickAction icon={CircleHelp} title="Need a hand?" text="Talk to our support team anytime" onClick={() => notify('Support chat opened')} /></div>
          </div>
        </section>
      </div>
      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-xl">{toast}</div>}
    </main>
  )
}

function Metric({ icon: Icon, label, value, trend, note }: { icon: typeof Wallet; label: string; value: string; trend: string; note: string }) { return <div className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between"><span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon size={17} /></span><span className="text-xs font-medium text-accent-foreground">{trend}</span></div><p className="mt-5 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div> }
function Status({ label }: { label: string }) { return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${label === 'Delivered' ? 'bg-accent/15 text-accent-foreground' : label === 'In transit' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}><span className="size-1.5 rounded-full bg-current" />{label}</span> }
function QuickAction({ icon: Icon, title, text, onClick }: { icon: typeof FileText; title: string; text: string; onClick: () => void }) { return <button onClick={onClick} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.02]"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-primary"><Icon size={18} /></span><span className="min-w-0"><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{text}</span></span><ArrowUpRight size={16} className="ml-auto shrink-0 text-muted-foreground" /></button> }
