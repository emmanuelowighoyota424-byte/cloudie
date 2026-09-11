'use client'

import { FormEvent, useEffect, useState } from 'react'

export default function KycPage() {
  const [kyc, setKyc] = useState<any>(null)
  const [file, setFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState('government_id')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    const response = await fetch('/api/kyc', { cache: 'no-store' })
    const data = await response.json()
    if (response.ok) setKyc(data)
    else setMessage(data.error || 'Unable to load KYC')
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file) return setMessage('Choose a document first.')
    setBusy(true); setMessage('')
    try {
      const upload = new FormData()
      upload.set('file', file)
      upload.set('documentType', documentType)
      const uploadResponse = await fetch('/api/kyc/upload', { method: 'POST', body: upload })
      const uploaded = await uploadResponse.json()
      if (!uploadResponse.ok) throw new Error(uploaded.error || 'Upload failed')

      const response = await fetch('/api/kyc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', documentType, storageKey: uploaded.storageKey, originalFilename: uploaded.originalFilename, mimeType: uploaded.mimeType }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Submission failed')
      setMessage('KYC submitted successfully.')
      setFile(null)
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to submit KYC') }
    finally { setBusy(false) }
  }

  const status = kyc?.kyc?.status || 'NOT_STARTED'
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-semibold">Identity verification</h1>
        <p className="mt-2 text-sm text-muted-foreground">Submit a secure identity document. Your document is stored privately and reviewed by authorized Cloudie staff.</p>
      </div>
      <section className="rounded-xl border p-5">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-sm text-muted-foreground">Current status</p><p className="text-xl font-semibold">{loading ? 'Loading…' : status.replaceAll('_', ' ')}</p></div>
          {status === 'VERIFIED' && <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-800">Verified</span>}
        </div>
      </section>
      {status !== 'VERIFIED' && (
        <form onSubmit={submit} className="space-y-4 rounded-xl border p-5">
          <div><label className="text-sm font-medium">Document type</label><select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="mt-1 w-full rounded-lg border bg-background p-3"><option value="government_id">Government ID</option><option value="passport">Passport</option><option value="drivers_license">Driver's license</option><option value="proof_of_address">Proof of address</option></select></div>
          <div><label className="text-sm font-medium">Document</label><input className="mt-1 block w-full rounded-lg border p-3" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <p className="text-xs text-muted-foreground">PDF, JPEG, PNG or WebP. Maximum 4 MB.</p>
          <button disabled={busy} className="rounded-lg bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50">{busy ? 'Submitting…' : status === 'REJECTED' ? 'Resubmit verification' : 'Submit verification'}</button>
          {message && <p className="text-sm">{message}</p>}
        </form>
      )}
      {Array.isArray(kyc?.submissions) && kyc.submissions.length > 0 && <section className="rounded-xl border p-5"><h2 className="font-semibold">Submission history</h2><div className="mt-3 space-y-2">{kyc.submissions.map((item: any) => <div key={item.id} className="flex justify-between rounded-lg border p-3 text-sm"><span>{item.documentType} · {item.originalFilename}</span><span>{item.status}</span></div>)}</div></section>}
    </main>
  )
}
