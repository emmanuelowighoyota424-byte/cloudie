'use client'

import { useState } from 'react'

export function PaystackCheckout({ workspaceId, orderId, amount, currency, status }: { workspaceId: string; orderId: string; amount: string; currency: string; status: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (status === 'PAID') return <span className="text-sm font-medium text-emerald-600">Paid</span>
  async function start() {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/payments/paystack/initialize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId }) })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.authorizationUrl) throw new Error(body?.error || 'Unable to start Paystack checkout')
      window.location.assign(body.authorizationUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment initialization failed')
      setBusy(false)
    }
  }
  return <div className="flex flex-col items-end gap-1"><button type="button" onClick={start} disabled={busy} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">{busy ? 'Opening Paystack…' : `Pay ${currency} ${amount}`}</button>{error && <span className="max-w-56 text-right text-xs text-destructive">{error}</span>}</div>
}
