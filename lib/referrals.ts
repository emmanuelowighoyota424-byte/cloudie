import { prisma } from '@/lib/prisma'
import { creditPoints } from '@/lib/points'

const DEFAULT_REWARD_POINTS = 100

export function normalizeReferralCode(value: unknown) {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^CLD-[A-F0-9]{12}$/.test(code) ? code : null
}

export async function getReferralProfile(userId: string) {
  const profile = await prisma.$queryRaw<Array<{ referralCode: string }>>`
    SELECT "referralCode" FROM "User" WHERE "id" = ${userId} LIMIT 1
  `
  const referrals = await prisma.$queryRaw<Array<{
    id: string
    referredEmail: string
    reward: number
    status: string
    createdAt: Date
    attributedAt: Date | null
    rewardedAt: Date | null
  }>>`
    SELECT "id", "referredEmail", "reward", "status", "createdAt", "attributedAt", "rewardedAt"
    FROM "Referral"
    WHERE "userId" = ${userId}
    ORDER BY "createdAt" DESC
    LIMIT 100
  `
  return { code: profile[0]?.referralCode ?? null, referrals }
}

export async function attributeReferral(referredUserId: string, referredEmail: string, code: string) {
  const normalized = normalizeReferralCode(code)
  if (!normalized) throw new Error('Invalid referral code')

  return await prisma.$transaction(async (tx) => {
    const referred = await tx.$queryRaw<Array<{ id: string; email: string }>>`
      SELECT "id", "email" FROM "User" WHERE "id" = ${referredUserId} LIMIT 1
    `
    if (!referred[0]) throw new Error('User not found')
    if (referred[0].email.toLowerCase() !== referredEmail.toLowerCase()) throw new Error('Referral email mismatch')

    const referrer = await tx.$queryRaw<Array<{ id: string; email: string }>>`
      SELECT "id", "email" FROM "User" WHERE "referralCode" = ${normalized} LIMIT 1
    `
    if (!referrer[0]) throw new Error('Referral code not found')
    if (referrer[0].id === referredUserId || referrer[0].email.toLowerCase() === referredEmail.toLowerCase()) {
      throw new Error('Self-referrals are not allowed')
    }

    const existing = await tx.$queryRaw<Array<{ id: string; userId: string }>>`
      SELECT "id", "userId" FROM "Referral" WHERE "referredUserId" = ${referredUserId} LIMIT 1
    `
    if (existing[0]) return { id: existing[0].id, duplicate: true }

    const id = crypto.randomUUID()
    await tx.$executeRaw`
      INSERT INTO "Referral"("id", "userId", "referredEmail", "reward", "status", "code", "referredUserId", "attributedAt")
      VALUES (${id}, ${referrer[0].id}, ${referredEmail.toLowerCase()}, 0, 'ATTRIBUTED', ${normalized}, ${referredUserId}, CURRENT_TIMESTAMP)
    `
    return { id, duplicate: false }
  })
}

export async function qualifyReferralForUser(userId: string, qualifyingReference: string) {
  const referral = await prisma.$queryRaw<Array<{ id: string; userId: string; status: string }>>`
    SELECT "id", "userId", "status"
    FROM "Referral"
    WHERE "referredUserId" = ${userId}
      AND "status" IN ('ATTRIBUTED', 'QUALIFIED', 'REWARDED')
    ORDER BY "createdAt" ASC
    LIMIT 1
  `
  const current = referral[0]
  if (!current || current.status === 'REWARDED') return { rewarded: false, duplicate: true }

  const reward = Number(process.env.REFERRAL_REWARD_POINTS ?? DEFAULT_REWARD_POINTS)
  if (!Number.isSafeInteger(reward) || reward <= 0) throw new Error('Invalid referral reward configuration')

  const pointReference = `referral:${current.id}:reward`
  await creditPoints({
    userId: current.userId,
    amount: reward,
    description: `Referral reward for ${userId}`,
    reference: pointReference,
  })

  await prisma.$executeRaw`
    UPDATE "Referral"
    SET "reward" = ${reward}, "status" = 'REWARDED', "qualifyingEvent" = ${qualifyingReference.slice(0, 180)}, "rewardedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${current.id} AND "status" <> 'REWARDED'
  `
  return { rewarded: true, duplicate: false, referralId: current.id, reward }
}
