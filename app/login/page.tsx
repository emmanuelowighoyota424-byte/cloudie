'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(searchParams.get('registered') ? 'Account created. Verify your email before signing in.' : '')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  async function resendVerification() {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError('Enter your email address first.')
      return
    }
    setResending(true)
    setError('')
    setResent(false)
    try {
      const result = await authClient.sendVerificationEmail({ email: normalizedEmail, callbackURL: '/dashboard' })
      if (result.error) {
        setError(result.error.message || 'Unable to resend verification email')
        return
      }
      setResent(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to resend verification email')
    } finally {
      setResending(false)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setResent(false)
    setLoading(true)
    try {
      const result = await authClient.signIn.email({ email: email.trim().toLowerCase(), password, callbackURL: '/dashboard' })
      if (result.error) {
        const status = 'status' in result.error ? Number(result.error.status) : 0
        const code = 'code' in result.error ? String(result.error.code) : ''
        if (status === 403 || code === 'EMAIL_NOT_VERIFIED') {
          setError('Email not verified. Check your inbox or resend the verification email below.')
        } else {
          setError(result.error.message || 'Unable to sign in')
        }
        return
      }
      router.push('/dashboard')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  const verificationBlocked = /Email not verified|verify your email|Account created/i.test(error)

  return (
    <main className="grid min-h-screen place-items-center bg-muted/40 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <Link href="/" className="text-sm font-semibold tracking-tight">cloudie<span className="text-primary">.</span></Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to manage your Cloudie workspace.</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block text-sm font-medium">Email<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 outline-none ring-offset-background focus:ring-2 focus:ring-primary" /></label>
          <label className="block text-sm font-medium">Password<input required minLength={8} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 outline-none ring-offset-background focus:ring-2 focus:ring-primary" /></label>
          {error && <p role="alert" className={`rounded-lg border px-3 py-2 text-sm ${verificationBlocked ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>{error}</p>}
          {resent && <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">Verification email sent. Check your inbox and spam folder.</p>}
          <button type="submit" disabled={loading} className="min-h-11 w-full rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60">{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
        {verificationBlocked && <button type="button" onClick={resendVerification} disabled={resending || !email} className="mt-4 min-h-11 w-full rounded-lg border px-4 font-medium hover:bg-muted disabled:opacity-60">{resending ? 'Sending verification email…' : 'Resend verification email'}</button>}
        <p className="mt-6 text-center text-sm text-muted-foreground">New to Cloudie? <Link href="/register" className="font-medium text-primary hover:underline">Create an account</Link></p>
      </section>
    </main>
  )
}
