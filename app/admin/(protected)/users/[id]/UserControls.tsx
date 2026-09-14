'use client'

import { useState } from 'react'

export default function UserControls({ userId, suspended, role }: { userId: string; suspended: boolean; role: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function act(payload: Record<string, unknown>) {
    setBusy(true); setMessage('')
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Operation failed')
      setMessage('Saved. Refreshing…')
      window.location.reload()
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Operation failed') } finally { setBusy(false) }
  }

  const suspend = () => { const reason = window.prompt('Reason for suspension')?.trim(); if (reason) void act({ action: 'suspend', reason }) }
  const points = () => {
    const raw = window.prompt('Point amount. Use a positive number to credit or negative to debit.')
    if (!raw) return
    const amount = Number(raw)
    const description = window.prompt('Ledger description')?.trim()
    if (!Number.isInteger(amount) || amount === 0 || !description) { setMessage('Enter a non-zero integer amount and description.'); return }
    void act({ action: 'points', amount, description })
  }

  return <div className="rounded-xl border bg-background p-4 space-y-4">
    <div><h2 className="font-semibold">Administrative controls</h2><p className="text-xs text-muted-foreground">Every privileged change is written to the audit log.</p></div>
    <div className="flex flex-wrap gap-2">
      {suspended ? <button disabled={busy} onClick={() => void act({ action: 'reactivate' })} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Reactivate user</button> : <button disabled={busy} onClick={suspend} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">Suspend user</button>}
      <button disabled={busy} onClick={points} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">Credit / debit points</button>
      <select disabled={busy} value={role} onChange={(e) => void act({ action: 'role', role: e.target.value })} className="rounded-lg border bg-background px-3 py-2 text-sm">
        <option value="USER">USER</option><option value="ADMIN">ADMIN</option><option value="SUPER_ADMIN">SUPER_ADMIN</option>
      </select>
    </div>
    {message && <p className="text-sm text-muted-foreground">{message}</p>}
  </div>
}
