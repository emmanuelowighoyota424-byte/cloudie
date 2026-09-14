'use client'

import { useEffect, useMemo, useState } from 'react'

type Workspace = { id: string; name: string; role: string }
type Shipment = { id: string; trackingId: string; origin: string; destination: string; status: string; createdAt: string; events?: Array<{ id: string; status: string; location?: string | null; note?: string | null; createdAt: string }> }

export function ShipmentsWorkspace({ points, workspaces }: { points: number; workspaces: Workspace[] }) {
  const eligible = useMemo(() => workspaces.filter(w => ['SUPER_ADMIN','WORKSPACE_ADMIN','MANAGER','STAFF'].includes(w.role)), [workspaces])
  const [workspaceId, setWorkspaceId] = useState(eligible[0]?.id ?? '')
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [cost, setCost] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!workspaceId) return
    void fetch(`/api/workspaces/${workspaceId}/shipments`, { cache: 'no-store' }).then(async r => {
      const data = await r.json().catch(() => null)
      if (!r.ok) throw new Error(data?.error ?? 'Unable to load shipments')
      setShipments(data.shipments ?? [])
    }).catch(e => setMessage(e.message))
    void fetch(`/api/workspaces/${workspaceId}/billing/price?action=shipments.create`, { cache: 'no-store' }).then(async r => {
      const data = await r.json().catch(() => null)
      if (r.ok) setCost(Number(data.amount))
    }).catch(() => setCost(null))
  }, [workspaceId])

  async function createShipment() {
    if (!origin.trim() || !destination.trim()) return setMessage('Origin and destination are required.')
    if (cost !== null && points < cost) return setMessage(`Insufficient Points. You need ${cost.toLocaleString()} Points.`)
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/shipments`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `shipment-ui:${crypto.randomUUID()}` }, body: JSON.stringify({ origin, destination }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Unable to create shipment')
      setShipments(current => [data.shipment, ...current]); setOrigin(''); setDestination('')
      setMessage(`Shipment ${data.shipment.trackingId} created. ${data.pointsCharged} Points charged.`)
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to create shipment') }
    finally { setBusy(false) }
  }

  return <main className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-sm text-muted-foreground">Cloudie / Shipments</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Shipments</h1><p className="mt-2 text-sm text-muted-foreground">Create, track, and manage the parcel lifecycle from one workspace.</p></header>
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border bg-background p-5"><p className="text-xs text-muted-foreground">Points available</p><p className="mt-2 text-2xl font-semibold">{points.toLocaleString()}</p></div>
      <div className="rounded-xl border bg-background p-5"><p className="text-xs text-muted-foreground">Shipments</p><p className="mt-2 text-2xl font-semibold">{shipments.length}</p></div>
      <div className="rounded-xl border bg-background p-5"><p className="text-xs text-muted-foreground">Create cost</p><p className="mt-2 text-2xl font-semibold">{cost === null ? '—' : `${cost.toLocaleString()} pts`}</p></div>
    </div>
    {!eligible.length ? <div className="rounded-xl border bg-background p-6">You do not have permission to create shipments in an active workspace.</div> : <>
      <section className="rounded-2xl border bg-background p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-semibold">Create shipment</h2><p className="mt-1 text-sm text-muted-foreground">Current cost: {cost === null ? 'loading pricing…' : `${cost.toLocaleString()} Points`} · balance after charge: {cost === null ? '—' : Math.max(0, points - cost).toLocaleString()}</p></div><select aria-label="Workspace" value={workspaceId} onChange={e => setWorkspaceId(e.target.value)} className="min-h-10 rounded-lg border bg-background px-3 text-sm">{eligible.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Sender / origin</span><input value={origin} onChange={e => setOrigin(e.target.value)} placeholder="Origin address" className="min-h-11 w-full rounded-lg border bg-background px-3" /></label><label className="text-sm"><span className="mb-1 block text-xs text-muted-foreground">Recipient / destination</span><input value={destination} onChange={e => setDestination(e.target.value)} placeholder="Destination address" className="min-h-11 w-full rounded-lg border bg-background px-3" /></label></div>
        <button disabled={busy || cost === null} onClick={createShipment} className="mt-4 min-h-11 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? 'Creating…' : 'Confirm & create shipment'}</button>
        {message && <p role="status" className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">{message}</p>}
      </section>
      <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-semibold">Shipment history</h2><span className="text-xs text-muted-foreground">{shipments.length} records</span></div>{shipments.length ? shipments.map(s => <article key={s.id} className="rounded-xl border bg-background p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><a href={`/track/${encodeURIComponent(s.trackingId)}`} className="font-semibold underline-offset-4 hover:underline">{s.trackingId}</a><p className="mt-1 text-sm text-muted-foreground">{s.origin} → {s.destination}</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{s.status.replaceAll('_',' ')}</span></div>{s.events?.length ? <div className="mt-4 border-t pt-4 space-y-2">{s.events.slice(0,5).map(e => <div key={e.id} className="text-xs text-muted-foreground"><b className="text-foreground">{e.status.replaceAll('_',' ')}</b> · {new Date(e.createdAt).toLocaleString()}{e.location ? ` · ${e.location}` : ''}{e.note ? ` · ${e.note}` : ''}</div>)}</div> : null}</article>) : <div className="rounded-xl border bg-background p-8 text-center text-sm text-muted-foreground">No shipments yet.</div>}</section>
    </>}
  </main>
}
