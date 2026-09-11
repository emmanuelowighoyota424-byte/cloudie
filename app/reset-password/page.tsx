'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { authClient } from '@/lib/auth-client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => setToken(new URLSearchParams(window.location.search).get('token') ?? ''), [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!token) return setError('This password reset link is missing its token.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true)
    const result = await authClient.resetPassword({ newPassword: password, token })
    setLoading(false)
    if (result.error) return setError(result.error.message || 'Unable to reset password')
    setDone(true)
    window.setTimeout(() => router.push('/login'), 1200)
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted/40 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <Link href="/" className="text-sm font-semibold tracking-tight">cloudie<span className="text-primary">.</span></Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Choose a new password</h1>
        {done ? <p className="mt-4 text-sm text-muted-foreground">Password updated. Redirecting you to sign in…</p> : (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block text-sm font-medium">New password<input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" /></label>
            <label className="block text-sm font-medium">Confirm password<input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" /></label>
            {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <button disabled={loading} className="min-h-11 w-full rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60">{loading ? 'Updating…' : 'Update password'}</button>
          </form>
        )}
      </section>
    </main>
  )
}
