'use client'

import { useEffect, useMemo, useState } from 'react'

type Workspace = { id: string; name: string; role: string }
type Shipment = { id: string; trackingId: string; origin: string; destination: string; status: string; createdAt: string; events?: Array<{ id: string; status: string; location?: string | null; note?: string | null; createdAt: string }> }

export function ShipmentsWorkspace({ points, workspaces }: { points: number; workspaces: Workspace[] }) {
  const eligible = useMemo(() => workspaces.filter(w => ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF','CUSTOMER'].includes(w.role)), [workspaces])
  const [workspaceId, setWorkspaceId] = useState(eligible[0]?.id ?? '')
  const currentWorkspace = eligible.find(w => w.id === workspaceId)
  const customerMode = currentWorkspace?.role === 'CUSTOMER'
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [cost, setCost] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!workspaceId) return
    setMessage('')
    void fetch(`/api/workspaces/${workspaceId}/shipments`, { cache: 'no-store' }).then(async response => {
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Unable to load shipments')
      setShipments(data.shipments ?? [])
    }).catch(error => setMessage(error instanceof Error ? error.message : 'Unable to load shipments'))
    void fetch(`/api/workspaces/${workspaceId}/billing/price?action=shipments.create`, { cache: 'no-store' }).then(async response => {
      const data = await response.json().catch(() => null)
      if (response.ok) setCost(Number(data.amount))
      else setCost(null)
    }).catch(() => setCost(null))
  }, [workspaceId])

  async function createShipment() {
    if (!origin.trim() || !destination.trim()) return setMessage('Please enter both pickup and delivery addresses.')
    if (cost !== null && points < cost) return setMessage(`Insufficient Points. You need ${cost.toLocaleString()} Points to create this shipment.`)
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/shipments`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `shipment-ui:${crypto.randomUUID()}` }, body: JSON.stringify({ origin, destination }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Unable to create shipment')
      setShipments(current => [data.shipment, ...current]); setOrigin(''); setDestination('')
      setMessage(`Shipment ${data.shipment.trackingId} created successfully. ${data.pointsCharged} Points charged.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to create shipment') }
    finally { setBusy(false) }
  }

  return <main className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-sm text-muted-foreground">Cloudie / Shipments</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{customerMode ? 'Send a shipment' : 'Shipments'}</h1><p className="mt-2 text-sm text-muted-foreground">{customerMode ? 'Create a shipment, pay with Points, and track it from pickup to delivery.' : 'Create, track, and manage the parcel lifecycle from one workspace.'}</p></header>
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border bg-background p-5"><p className="text-xs text-muted-foreground">Points available</p><p className="mt-2 text-2xl font-semibold">{points.toLocaleString()}</p></div>
      <div className="rounded-xl border bg-background p-5"><p className="text-xs text-muted-foreground">My shipments</p><p className="mt-2 text-2xl font-semibold">{shipments.length}</p></div>
      <div className="rounded-xl border bg-background p-5"><p className="text-xs text-muted-foreground">Creation fee</p><p className="mt-2 text-2xl font-semibold">{cost === null ? '—' : `${cost.toLocaleString()} pts`}</p></div>
    </div>
    {!eligible.length ? <div className="rounded-xl border bg-background p-6">You do not have permission to create shipments in an active workspace.</div> : <>
      <section className="rounded-2xl border bg-background p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold">Create shipment</h2><p className="mt-1 text-sm text-muted-foreground">Enter the pickup and delivery addresses. Cloudie will generate your tracking number automatically.</p></div>{eligible.length > 1 && <select aria-label="Workspace" value={workspaceId} onChange={e => setWorkspaceId(e.target.value)} className="min-h-10 rounded-lg border bg-background px-3 text-sm">{eligible.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}</div>
        <div className="mt-6 grid gap-5 md:grid-cols-2"><label className="text-sm"><span className="mb-2 block font-medium">Pickup address</span><textarea value={origin} onChange={e => setOrigin(e.target.value)} maxLength={500} rows={4} placeholder="Where should we collect the parcel?" className="w-full rounded-xl border bg-background px-4 py-3 outline-none focus:ring-2" /></label><label className="text-sm"><span className="mb-2 block font-medium">Delivery address</span><textarea value={destination} onChange={e => setDestination(e.target.value)} maxLength={500} rows={4} placeholder="Where should we deliver the parcel?" className="w-full rounded-xl border bg-background px-4 py-3 outline-none focus:ring-2" /></label></div>
        <div className="mt-5 flex flex-col gap-3 rounded-xl bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">Shipment creation fee</p><p className="text-xs text-muted-foreground">{cost === null ? 'Loading current Points price…' : `${cost.toLocaleString()} Points will be charged only when creation succeeds.`}</p></div><button disabled={busy || cost === null || !origin.trim() || !destination.trim() || (cost !== null && points < cost)} onClick={createShipment} className="min-h-11 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Creating…' : 'Confirm & create shipment'}</button></div>
        {message && <p role="status" className="mt-4 rounded-xl border bg-muted/50 p-4 text-sm">{message}</p>}
      </section>
      <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-semibold">{customerMode ? 'My shipments' : 'Shipment history'}</h2><span className="text-xs text-muted-foreground">{shipments.length} records</span></div>{shipments.length ? shipments.map(s => <article key={s.id} className="rounded-xl border bg-background p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><a href={`/track/${encodeURIComponent(s.trackingId)}`} className="font-semibold underline-offset-4 hover:underline">{s.trackingId}</a><p className="mt-1 text-sm text-muted-foreground">{s.origin} → {s.destination}</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{s.status.replaceAll('_',' ')}</span></div>{s.events?.length ? <div className="mt-4 space-y-2 border-t pt-4">{s.events.map(e => <div key={e.id} className="text-xs text-muted-foreground"><b className="text-foreground">{e.status.replaceAll('_',' ')}</b> · {new Date(e.createdAt).toLocaleString()}{e.location ? ` · ${e.location}` : ''}{e.note ? ` · ${e.note}` : ''}</div>)}</div> : null}</article>) : <div className="rounded-xl border bg-background p-8 text-center text-sm text-muted-foreground">No shipments yet. Create your first shipment above.</div>}</section>
    </>}
  </main>
}
