import { requireUser } from '@/lib/authorization'
import { getReferralProfile } from '@/lib/referrals'

export const dynamic = 'force-dynamic'

export default async function ReferralsPage() {
  const user = await requireUser()
  const { code, referrals } = await getReferralProfile(user.id)
  const rewards = referrals.reduce((sum, referral) => sum + referral.reward, 0)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const referralUrl = code ? `${appUrl}/register?ref=${encodeURIComponent(code)}` : ''

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Personal / Referrals</p>
        <h1 className="text-2xl font-semibold">Referral rewards</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-background p-5">
          <p className="text-xs text-muted-foreground">Your referral code</p>
          <p className="mt-2 text-2xl font-semibold">{code ?? 'Unavailable'}</p>
          {referralUrl && <p className="mt-2 break-all text-xs text-muted-foreground">{referralUrl}</p>}
        </div>
        <div className="rounded-xl border bg-background p-5">
          <p className="text-xs text-muted-foreground">Recorded rewards</p>
          <p className="mt-2 text-2xl font-semibold">{rewards.toLocaleString()} points</p>
        </div>
      </div>
      <div className="rounded-xl border bg-background">
        <div className="border-b p-4 font-medium">Referral history</div>
        <div className="divide-y">
          {referrals.length ? referrals.map((referral) => (
            <div key={referral.id} className="flex justify-between gap-4 p-4 text-sm">
              <div>
                <div>{referral.referredEmail}</div>
                <div className="text-xs text-muted-foreground">
                  {referral.status} · {referral.createdAt.toLocaleString()}
                </div>
              </div>
              <b>{referral.reward} points</b>
            </div>
          )) : <p className="p-6 text-sm text-muted-foreground">No referrals yet.</p>}
        </div>
      </div>
    </div>
  )
}
