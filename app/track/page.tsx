'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function TrackPage() {
  const router = useRouter()
  const [trackingNumber, setTrackingNumber] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    const value = trackingNumber.trim().toUpperCase()
    if (!/^CLD-[0-9A-F]{10}$/.test(value)) return
    router.push(`/track/${value}`)
  }

  return <main className="grid min-h-screen place-items-center bg-muted/40 px-4 py-12"><section className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-sm sm:p-8"><Link href="/" className="text-sm font-semibold">cloudie<span className="text-primary">.</span></Link><h1 className="mt-8 text-3xl font-semibold tracking-tight">Track your shipment</h1><p className="mt-2 text-sm text-muted-foreground">Enter the Cloudie tracking number printed on your shipment documents.</p><form onSubmit={submit} className="mt-6 space-y-3"><input required inputMode="text" autoCapitalize="characters" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="CLD-XXXXXXXXXX" className="min-h-12 w-full rounded-lg border bg-background px-3 font-mono outline-none focus:ring-2 focus:ring-primary" /><button className="min-h-11 w-full rounded-lg bg-primary px-4 font-medium text-primary-foreground">Track shipment</button></form><p className="mt-4 text-xs text-muted-foreground">Tracking numbers use the format CLD-XXXXXXXXXX.</p></section></main>
}
