'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      // The server-side bootstrap only accepts the configured admin credentials.
      // It creates/upgrades the account when needed, without storing credentials in source control.
      const bootstrap = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!bootstrap.ok && bootstrap.status !== 409) {
        const body = await bootstrap.json().catch(() => ({}))
        throw new Error(body.error || 'Admin credentials are not configured')
      }

      const result = await authClient.signIn.email({ email, password, callbackURL: '/admin' })
      if (result.error) throw new Error(result.error.message || 'Invalid admin credentials')

      router.replace('/admin')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted/40 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <Link href="/" className="text-sm font-semibold tracking-tight">cloudie<span className="text-primary">.</span></Link>
        <div className="mt-8">
          <p className="text-sm font-medium text-primary">Administrator access</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Cloudie Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in with the configured administrator account.</p>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block text-sm font-medium">
            Admin email
            <input required type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 outline-none ring-offset-background focus:ring-2 focus:ring-primary" />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input required minLength={8} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 outline-none ring-offset-background focus:ring-2 focus:ring-primary" />
          </label>
          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <button disabled={loading} className="min-h-11 w-full rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60">
            {loading ? 'Signing in…' : 'Sign in to Admin'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">Protected by Cloudie server-side role authorization.</p>
      </section>
    </main>
  )
}
