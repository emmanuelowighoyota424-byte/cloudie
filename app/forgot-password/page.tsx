'use client'

import Link from 'next/link'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const result = await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` })
    setLoading(false)
    if (result.error) return setError(result.error.message || 'Unable to request a password reset')
    setSent(true)
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted/40 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <Link href="/login" className="text-sm font-semibold tracking-tight">cloudie<span className="text-primary">.</span></Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-2 text-sm text-muted-foreground">Enter your email and Cloudie will send a secure reset link.</p>
        {sent ? <div className="mt-8 rounded-xl border bg-muted/40 p-4 text-sm">If an account exists for that address, a reset email has been sent.</div> : (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block text-sm font-medium">Email<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" /></label>
            {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <button disabled={loading} className="min-h-11 w-full rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60">{loading ? 'Sending…' : 'Send reset link'}</button>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-muted-foreground"><Link href="/login" className="font-medium text-primary hover:underline">Back to sign in</Link></p>
      </section>
    </main>
  )
}
