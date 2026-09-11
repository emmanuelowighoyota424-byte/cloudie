'use client'

import { useEffect, useState } from 'react'
import { PaystackCheckout } from '@/components/paystack-checkout'

type Workspace = { id: string; name: string; role: string }
type Order = { id: string; total: string; currency?: string; status: string; paymentStatus: string; createdAt: string; payments?: Array<{ provider: string; providerReference?: string | null; status: string; verifiedAt?: string | null }> }

export default function CustomerOrdersPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState('')

  useEffect(() => { fetch('/api/workspaces').then((r) => r.json()).then((body) => { const items = Array.isArray(body?.workspaces) ? body.workspaces.filter((w: Workspace) => w.role === 'CUSTOMER') : []; setWorkspaces(items); if (items[0]) setWorkspaceId(items[0].id) }).catch(() => setError('Unable to load workspaces')) }, [])
  useEffect(() => { if (!workspaceId) return; fetch(`/api/workspaces/${workspaceId}/orders`).then((r) => r.json()).then((body) => setOrders(Array.isArray(body?.orders) ? body.orders : [])).catch(() => setError('Unable to load orders')) }, [workspaceId])

  return <main className="min-h-screen bg-muted/40 px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto max-w-5xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-muted-foreground">Customer operations</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Orders & payments</h1><p className="mt-2 text-sm text-muted-foreground">Pay persisted Cloudie orders through the server-verified Paystack checkout.</p></div>{workspaces.length > 1 && <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}</div>{error && <p className="mt-4 text-sm text-destructive">{error}</p>}<div className="mt-6 space-y-3">{orders.map((order) => <article key={order.id} className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="font-medium">Order {order.id}</p><p className="mt-1 text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleString()} · {order.status} · payment {order.paymentStatus}</p>{order.payments?.filter((p) => p.provider === 'paystack').map((p) => <p key={`${p.providerReference}-${p.status}`} className="mt-1 text-xs text-muted-foreground">Paystack reference: {p.providerReference || '—'} · {p.status}</p>)}</div><PaystackCheckout workspaceId={workspaceId} orderId={order.id} amount={order.total} currency={order.currency || 'NGN'} status={order.paymentStatus} /></div></article>)}{orders.length === 0 && <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">No orders available for payment.</div>}</div></div></main>
}
