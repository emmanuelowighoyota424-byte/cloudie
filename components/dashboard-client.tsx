'use client'

import Link from 'next/link'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

type Workspace = { id: string; name: string; slug: string; plan: string; role: string }
type Metrics = { shipmentCount: number; deliveredShipments: number; pendingShipments: number; activeShipments: number; customers: number; vendors: number; orders: number; revenue: string }
type Shipment = { id: string; trackingId: string; origin: string; destination: string; status: string; createdAt: string }

export function DashboardClient({ userName, workspaces, initialMetrics, initialShipments }: { userName: string; workspaces: Workspace[]; initialMetrics: Metrics | null; initialShipments: Shipment[] }) {
  const [activeWorkspace, setActiveWorkspace] = useState(workspaces[0]?.id ?? '')
  const [metrics, setMetrics] = useState(initialMetrics)
  const [shipments, setShipments] = useState(initialShipments)
  const [creating, setCreating] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('')
  const [message, setMessage] = useState('')

  async function switchWorkspace(id: string) {
    setActiveWorkspace(id)
    setMessage('Loading workspace…')
    const response = await fetch(`/api/workspaces/${id}/dashboard`, { cache: 'no-store' })
    if (!response.ok) { setMessage('Unable to load that workspace'); return }
    const data = await response.json()
    setMetrics(data.metrics)
    setShipments(data.recentShipments)
    setMessage('')
  }

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault()
    setCreating(true); setMessage('')
    const response = await fetch('/api/workspaces', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: workspaceName }) })
    const data = await response.json().catch(() => null)
    setCreating(false)
    if (!response.ok) { setMessage(data?.error ?? 'Unable to create workspace'); return }
    window.location.reload()
  }

  if (!workspaces.length) {
    return <section className="mx-auto max-w-xl rounded-2xl border bg-card p-6 shadow-sm sm:p-8"><h1 className="text-2xl font-semibold">Create your first workspace</h1><p className="mt-2 text-sm text-muted-foreground">Your account is ready. Give your business workspace a name to continue.</p><form onSubmit={createWorkspace} className="mt-6 space-y-4"><input required minLength={2} maxLength={80} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="Acme Corporation" className="min-h-11 w-full rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" />{message && <p role="alert" className="text-sm text-destructive">{message}</p>}<button disabled={creating} className="min-h-11 w-full rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60">{creating ? 'Creating…' : 'Create workspace'}</button></form></section>
  }

  return <>
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-sm text-muted-foreground">Workspace dashboard</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome, {userName}</h1><p className="mt-2 text-sm text-muted-foreground">Real-time operational data from your PostgreSQL workspace.</p></div>
      <div className="flex gap-2"><select aria-label="Select workspace" value={activeWorkspace} onChange={(e) => switchWorkspace(e.target.value)} className="min-h-11 max-w-full rounded-lg border bg-background px-3 text-sm">{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.role}</option>)}</select><button onClick={() => authClient.signOut().then(() => window.location.assign('/login'))} className="min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-muted">Sign out</button></div>
    </header>
    {message && <p role="status" className="mt-4 text-sm text-muted-foreground">{message}</p>}
    {metrics && <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Shipments" value={metrics.shipmentCount} /><Metric label="Active" value={metrics.activeShipments} /><Metric label="Delivered" value={metrics.deliveredShipments} /><Metric label="Paid revenue" value={`$${Number(metrics.revenue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} /></div>}
    {metrics && <div className="mt-3 grid gap-3 sm:grid-cols-3"><Metric label="Customers" value={metrics.customers} /><Metric label="Vendors" value={metrics.vendors} /><Metric label="Orders" value={metrics.orders} /></div>}
    <section className="mt-6 rounded-2xl border bg-card shadow-sm"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Recent shipments</h2><p className="mt-1 text-sm text-muted-foreground">Only records belonging to the selected workspace are shown.</p></div><Link href="/track" className="text-sm font-medium text-primary hover:underline">Public tracking</Link></div>{shipments.length ? <div className="divide-y">{shipments.map((shipment) => <div key={shipment.id} className="grid gap-2 p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div><Link href={`/track/${shipment.trackingId}`} className="font-medium hover:underline">{shipment.trackingId}</Link><p className="mt-1 text-sm text-muted-foreground">{shipment.origin} → {shipment.destination}</p></div><span className="w-fit rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{shipment.status.replaceAll('_', ' ')}</span></div>)}</div> : <div className="p-8 text-center"><p className="font-medium">No shipments yet</p><p className="mt-1 text-sm text-muted-foreground">Create a shipment to start tracking your operations.</p></div>}</section>
  </>
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border bg-card p-5 shadow-sm"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p></div> }
