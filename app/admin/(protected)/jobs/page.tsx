'use client'

import { useEffect, useState } from 'react'

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [error, setError] = useState('')
  async function load() { const r = await fetch('/api/admin/jobs', { cache: 'no-store' }); const d = await r.json(); if (!r.ok) return setError(d.error || 'Unable to load jobs'); setJobs(d.jobs || []) }
  useEffect(() => { void load() }, [])
  async function retry(id: string) { const r = await fetch('/api/admin/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); const d = await r.json(); if (!r.ok) setError(d.error || 'Retry failed'); else await load() }
  return <main className="mx-auto max-w-7xl space-y-6 p-6"><div><h1 className="text-3xl font-semibold">Background jobs</h1><p className="mt-2 text-sm text-muted-foreground">Observe and safely retry durable jobs.</p></div>{error && <div className="rounded-lg border border-red-300 p-3 text-sm">{error}</div>}<div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Attempts</th><th className="p-3">Run at</th><th className="p-3" /></tr></thead><tbody>{jobs.map((job) => <tr key={job.id} className="border-b"><td className="p-3">{job.type}</td><td className="p-3">{job.status}</td><td className="p-3">{job.attempts}/{job.maxAttempts}</td><td className="p-3">{String(job.runAt)}</td><td className="p-3">{['FAILED','CANCELLED'].includes(job.status) && <button onClick={() => void retry(job.id)} className="rounded-lg border px-3 py-1">Retry</button>}</td></tr>)}{jobs.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No jobs.</td></tr>}</tbody></table></div></main>
}
