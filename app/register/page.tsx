'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase()
    if (ref && /^CLD-[A-F0-9]{12}$/.test(ref)) localStorage.setItem('cloudie-referral-code', ref)
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    const normalizedEmail = email.trim().toLowerCase()
    try {
      const result = await authClient.signUp.email({
        name: name.trim(),
        email: normalizedEmail,
        password,
        callbackURL: '/dashboard',
      })
      if (result.error) {
        setError(result.error.message || 'Unable to create account')
        return
      }
      router.replace('/dashboard')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted/40 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <Link href="/" className="text-sm font-semibold tracking-tight">cloudie<span className="text-primary">.</span></Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Create your Cloudie workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">Create your account and continue directly to your workspace.</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block text-sm font-medium">Full name<input required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" /></label>
          <label className="block text-sm font-medium">Email<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" /></label>
          <label className="block text-sm font-medium">Password<input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" /></label>
          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <button type="submit" disabled={loading} className="min-h-11 w-full rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60">{loading ? 'Creating account…' : 'Create account'}</button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link></p>
      </section>
    </main>
  )
}
