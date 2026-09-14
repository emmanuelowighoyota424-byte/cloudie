'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { authClient } from '@/lib/auth-client'

export default function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setEmail(searchParams.get('email')?.trim().toLowerCase() || '')
  }, [searchParams])

  async function resend() {
    if (!email) {
      setError('Enter your account email first.')
      return
    }
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const result = await authClient.sendVerificationEmail({ email, callbackURL: '/dashboard' })
      if (result.error) {
        setError(result.error.message || 'Unable to send verification email')
        return
      }
      setMessage('Verification email sent. Check your inbox and spam folder.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send verification email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted/40 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
        <Link href="/" className="text-sm font-semibold tracking-tight">cloudie<span className="text-primary">.</span></Link>
        <div className="mx-auto mt-10 grid size-14 place-items-center rounded-full bg-primary/10 text-2xl">✓</div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Verify your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">We sent a verification link to <strong className="text-foreground">{email || 'your email address'}</strong>. Verify it before signing in.</p>
        <button type="button" onClick={resend} disabled={loading || !email} className="mt-8 min-h-11 w-full rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60">{loading ? 'Sending…' : 'Resend verification email'}</button>
        {message && <p role="status" className="mt-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">{message}</p>}
        {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <p className="mt-6 text-sm text-muted-foreground">Already verified? <Link href="/login" className="font-medium text-primary hover:underline">Return to sign in</Link></p>
      </section>
    </main>
  )
}
