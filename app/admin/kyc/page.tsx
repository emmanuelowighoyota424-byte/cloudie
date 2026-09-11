'use client'

import { useEffect, useState } from 'react'

export default function AdminKycPage() {
  const [items, setItems] = useState<any[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  async function load() {
    const response = await fetch('/api/admin/kyc', { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) return setError(data.error || 'Unable to load KYC queue')
    setItems(data.items || [])
  }
  useEffect(() => { void load() }, [])

  async function review(userId: string, status: string) {
    let reason: string | undefined
    if (status === 'REJECTED') {
      reason = window.prompt('Rejection reason (required):')?.trim()
      if (!reason) return
    }
    setBusy(userId)
    const response = await fetch('/api/kyc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'review', userId, status, reason }) })
    const data = await response.json()
    setBusy('')
    if (!response.ok) setError(data.error || 'Review failed')
    else await load()
  }

  return <main className="mx-auto max-w-6xl space-y-6 p-6"><div><h1 className="text-3xl font-semibold">KYC review</h1><p className="mt-2 text-sm text-muted-foreground">Review identity submissions through the authorized private document endpoint.</p></div>{error && <div className="rounded-lg border border-red-300 p-3 text-sm">{error}</div>}<div className="space-y-3">{items.map((item) => <article key={item.id} className="rounded-xl border p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{item.name || item.email}</h2><p className="text-sm text-muted-foreground">{item.email} · {item.status}</p></div><div className="flex gap-2">{item.status === 'PENDING' && <button disabled={busy === item.userId} onClick={() => void review(item.userId, 'UNDER_REVIEW')} className="rounded-lg border px-3 py-2 text-sm">Review</button>}{item.status === 'UNDER_REVIEW' && <><button disabled={busy === item.userId} onClick={() => void review(item.userId, 'VERIFIED')} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white">Approve</button><button disabled={busy === item.userId} onClick={() => void review(item.userId, 'REJECTED')} className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white">Reject</button></>}</div></div><div className="mt-4 space-y-2">{(item.submissions || []).map((doc: any) => <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>{doc.documentType} · {doc.originalFilename} · {doc.status}</span><a href={`/api/admin/kyc/${doc.id}/document`} target="_blank" rel="noreferrer" className="underline">View securely</a></div>)}</div></article>)}{items.length === 0 && <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">No KYC submissions found.</div>}</div></main>
}
