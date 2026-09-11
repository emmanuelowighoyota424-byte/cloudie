'use client'

import { useEffect, useMemo, useState } from 'react'

type Mode = 'customer' | 'driver' | 'warehouse'
type Workspace = { id: string; name: string; role: string }
type Shipment = { id: string; trackingId: string; origin: string; destination: string; status: string; deliveredAt?: string | null; events?: Array<{ id: string; status: string; note?: string | null; createdAt: string }>; customer?: { name: string } | null; warehouse?: { name: string } | null; proofOfDelivery?: { recipient: string; deliveredAt: string; notes?: string | null } | null }

const labels: Record<Mode, { title: string; description: string; role: string }> = {
  customer: { title: 'Customer operations', description: 'Your shipments, delivery history, authorized documents, and live tracking.', role: 'CUSTOMER' },
  driver: { title: 'Driver operations', description: 'Manage only shipments assigned to your driver profile.', role: 'DRIVER' },
  warehouse: { title: 'Warehouse operations', description: 'Receive and dispatch shipments assigned to warehouses in this workspace.', role: 'WAREHOUSE_STAFF' },
}

export function OperationsClient({ mode }: { mode: Mode }) {
  const meta = labels[mode]
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [recipient, setRecipient] = useState('')
  const [notes, setNotes] = useState('')

  const eligible = useMemo(() => workspaces.filter((w) => w.role === meta.role), [workspaces, meta.role])

  async function loadWorkspaces() {
    const response = await fetch('/api/workspaces', { cache: 'no-store' })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.error ?? 'Unable to load workspaces')
    const next = data.workspaces ?? []
    setWorkspaces(next)
    const first = next.find((w: Workspace) => w.role === meta.role)
    setWorkspaceId(first?.id ?? '')
  }

  async function loadShipments(id: string) {
    if (!id) return setShipments([])
    setMessage('Loading…')
    const endpoint = mode === 'driver' ? `/api/workspaces/${id}/driver/shipments` : mode === 'customer' ? `/api/workspaces/${id}/customer/shipments` : `/api/workspaces/${id}/warehouse/shipments`
    const response = await fetch(endpoint, { cache: 'no-store' })
    const data = await response.json().catch(() => null)
    if (!response.ok) { setMessage(data?.error ?? 'Unable to load operations'); setShipments([]); return }
    setShipments(data.shipments ?? [])
    setMessage('')
  }

  useEffect(() => { loadWorkspaces().catch((error) => setMessage(error.message)) }, [meta.role])
  useEffect(() => { loadShipments(workspaceId) }, [workspaceId, mode])

  async function driverStatus(shipmentId: string, status: string) {
    setBusy(shipmentId + status)
    const response = await fetch(`/api/workspaces/${workspaceId}/driver/shipments`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shipmentId, status }) })
    const data = await response.json().catch(() => null)
    setBusy(null)
    if (!response.ok) return setMessage(data?.error ?? 'Unable to update shipment')
    await loadShipments(workspaceId)
  }

  async function completeDelivery(shipmentId: string) {
    if (!recipient.trim()) return setMessage('Recipient name is required for proof of delivery')
    setBusy(shipmentId + 'DELIVERED')
    const response = await fetch(`/api/workspaces/${workspaceId}/shipments/${shipmentId}/pod`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recipient, notes }) })
    const data = await response.json().catch(() => null)
    setBusy(null)
    if (!response.ok) return setMessage(data?.error ?? 'Unable to complete delivery')
    setRecipient(''); setNotes(''); await loadShipments(workspaceId)
  }

  async function warehouseAction(shipmentId: string, action: 'RECEIVE' | 'DISPATCH') {
    setBusy(shipmentId + action)
    const response = await fetch(`/api/workspaces/${workspaceId}/warehouse/shipments`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shipmentId, action }) })
    const data = await response.json().catch(() => null)
    setBusy(null)
    if (!response.ok) return setMessage(data?.error ?? 'Unable to update warehouse shipment')
    await loadShipments(workspaceId)
  }

  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm text-muted-foreground">Cloudie operations</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{meta.title}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{meta.description}</p></div>
      <select aria-label="Select workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="min-h-11 rounded-lg border bg-background px-3 text-sm" disabled={!eligible.length}>{eligible.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>
    </header>
    {message && <p role="status" className="mt-5 rounded-lg border bg-muted/40 p-3 text-sm">{message}</p>}
    {!eligible.length ? <section className="mt-8 rounded-2xl border bg-card p-8 text-center"><h2 className="font-semibold">No eligible workspace</h2><p className="mt-2 text-sm text-muted-foreground">Your account does not currently have the {meta.role.replace('_', ' ').toLowerCase()} role in an active workspace.</p></section> : <section className="mt-8 space-y-4">{shipments.length ? shipments.map((shipment) => <article key={shipment.id} className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">{shipment.trackingId}</p><p className="mt-1 text-sm text-muted-foreground">{shipment.origin} → {shipment.destination}</p>{shipment.customer && <p className="mt-1 text-xs text-muted-foreground">Customer: {shipment.customer.name}</p>}{shipment.warehouse && <p className="mt-1 text-xs text-muted-foreground">Warehouse: {shipment.warehouse.name}</p>}</div><span className="w-fit rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{shipment.status.replaceAll('_', ' ')}</span></div>
      <div className="mt-4 border-t pt-4"><h3 className="text-sm font-medium">History</h3><div className="mt-2 space-y-2">{(shipment.events ?? []).slice(0, 5).map((event) => <div key={event.id} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{event.status.replaceAll('_', ' ')}</span> · {new Date(event.createdAt).toLocaleString()}{event.note ? ` · ${event.note}` : ''}</div>)}</div></div>
      {mode === 'driver' && <div className="mt-4 flex flex-wrap gap-2">{(['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED', 'RETURNED'] as const).map((status) => <button key={status} disabled={busy !== null || shipment.status === status} onClick={() => driverStatus(shipment.id, status)} className="min-h-10 rounded-lg border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">{busy === shipment.id + status ? 'Saving…' : status.replaceAll('_', ' ')}</button>)}{['OUT_FOR_DELIVERY'].includes(shipment.status) && !shipment.proofOfDelivery && <div className="mt-3 w-full rounded-xl bg-muted/40 p-4"><p className="text-sm font-medium">Proof of delivery</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient name" className="min-h-10 rounded-lg border bg-background px-3 text-sm" /><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Delivery notes (optional)" className="min-h-10 rounded-lg border bg-background px-3 text-sm" /></div><button disabled={busy !== null} onClick={() => completeDelivery(shipment.id)} className="mt-3 min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy === shipment.id + 'DELIVERED' ? 'Completing…' : 'Complete delivery'}</button></div>}</div>}
      {mode === 'warehouse' && <div className="mt-4 flex gap-2"><button disabled={busy !== null} onClick={() => warehouseAction(shipment.id, 'RECEIVE')} className="min-h-10 rounded-lg border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50">Receive</button><button disabled={busy !== null} onClick={() => warehouseAction(shipment.id, 'DISPATCH')} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">Dispatch</button></div>}
      {mode === 'customer' && shipment.proofOfDelivery && <div className="mt-4 rounded-xl bg-muted/40 p-4 text-sm"><p className="font-medium">Delivered to {shipment.proofOfDelivery.recipient}</p><p className="mt-1 text-muted-foreground">{new Date(shipment.proofOfDelivery.deliveredAt).toLocaleString()}{shipment.proofOfDelivery.notes ? ` · ${shipment.proofOfDelivery.notes}` : ''}</p></div>}
    </article>) : <div className="rounded-2xl border bg-card p-10 text-center"><h2 className="font-semibold">No shipments</h2><p className="mt-2 text-sm text-muted-foreground">There are no records available for this role and workspace yet.</p></div>}</section>}
  </main>
}
