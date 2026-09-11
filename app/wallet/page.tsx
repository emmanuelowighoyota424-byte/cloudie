'use client'

import { useCallback, useEffect, useState } from 'react'

interface LedgerEntry {
  id: string
  amount: number
  balance: number
  description: string
  reference: string | null
  createdAt: string
}

export default function WalletPage() {
  const [balance, setBalance] = useState(0)
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/wallet', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to load wallet')
      setBalance(data.balance ?? 0)
      setEntries(data.transactions ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load wallet')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="text-sm font-medium text-slate-500">Personal workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Points wallet</h1>
          <p className="mt-2 text-sm text-slate-500">Your balance is calculated from the immutable Cloudie points ledger.</p>
        </div>

        <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
          <p className="text-sm text-slate-400">Available points</p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <span className="text-4xl font-semibold tracking-tight">{loading ? '—' : balance.toLocaleString()}</span>
            <button onClick={() => void load()} className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10">Refresh</button>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="font-semibold">Transaction history</h2>
          </div>
          {error ? <div className="p-6 text-sm text-red-600">{error}</div> : entries.length === 0 && !loading ? <div className="p-8 text-center text-sm text-slate-500">No point transactions yet.</div> : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map((entry) => (
                <div key={entry.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{entry.description}</p>
                    <p className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}{entry.reference ? ` · ${entry.reference}` : ''}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className={`font-semibold ${entry.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{entry.amount >= 0 ? '+' : ''}{entry.amount.toLocaleString()}</p>
                    <p className="text-xs text-slate-500">Balance {entry.balance.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
