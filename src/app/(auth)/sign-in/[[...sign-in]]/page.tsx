'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs/legacy'

// Public demo build: no real signup form. The demo credentials are shown on
// screen (from NEXT_PUBLIC_DEMO_EMAIL / NEXT_PUBLIC_DEMO_PASSWORD, set once at
// deploy time — see .env.example) so visitors know what they're logging in
// as, and the button signs them into that single pre-seeded Clerk account.
// That account has no real personal data behind it, so there's nothing
// sensitive about the credentials being public.
export default function SignInPage() {
  const { isLoaded, signIn, setActive } = useSignIn()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function viewDemo() {
    if (!isLoaded || loading) return
    setLoading(true)
    setError(null)

    const email = process.env.NEXT_PUBLIC_DEMO_EMAIL
    const password = process.env.NEXT_PUBLIC_DEMO_PASSWORD

    if (!email || !password) {
      setError('Demo login isn’t configured yet — see .env.example.')
      setLoading(false)
      return
    }

    try {
      const result = await signIn.create({ identifier: email, password })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        router.push('/')
      } else {
        console.error('[view-demo] sign-in did not complete:', result)
        setError(`Could not start the demo session (status: ${result.status}). Check the console for details.`)
      }
    } catch (err) {
      console.error('[view-demo] sign-in failed:', err)
      const clerkMessage = (err as { errors?: { longMessage?: string; message?: string }[] })?.errors?.[0]
      setError(clerkMessage?.longMessage ?? clerkMessage?.message ?? 'Could not start the demo session. Check the console for details.')
    } finally {
      setLoading(false)
    }
  }

  const demoEmail = process.env.NEXT_PUBLIC_DEMO_EMAIL
  const demoPassword = process.env.NEXT_PUBLIC_DEMO_PASSWORD

  return (
    <div
      className="w-full max-w-sm rounded-3xl p-10 text-center"
      style={{ background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 4px 24px 0 rgba(0,0,0,0.08)' }}
    >
      <h2 className="text-lg font-semibold text-slate-900 mb-2">Explore the live demo</h2>
      <p className="text-sm text-slate-500 mb-6">
        One click puts you inside a fully seeded workspace. No signup, no email required.
      </p>
      {demoEmail && demoPassword && (
        <div className="mb-6 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-left">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1">Demo credentials</p>
          <p className="text-sm text-slate-700 font-mono">{demoEmail}</p>
          <p className="text-sm text-slate-700 font-mono">{demoPassword}</p>
        </div>
      )}
      <button
        type="button"
        onClick={viewDemo}
        disabled={loading || !isLoaded}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] text-black font-semibold shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? 'Signing you in…' : 'View Demo'}
      </button>
      {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
    </div>
  )
}
