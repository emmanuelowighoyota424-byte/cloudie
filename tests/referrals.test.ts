import test from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import { attributeReferral, qualifyReferralForUser } from '../lib/referrals'
import { getPointBalance } from '../lib/points'

const id = () => crypto.randomUUID()

test('referral attribution rejects self-referral and rewards a qualifying user once', async () => {
  const referrer = await prisma.user.create({ data: { id: id(), name: 'Referral Referrer', email: `referrer-${Date.now()}@example.test`, emailVerified: true } })
  const referred = await prisma.user.create({ data: { id: id(), name: 'Referral Referred', email: `referred-${Date.now()}@example.test`, emailVerified: true } })

  try {
    const codeRows = await prisma.$queryRaw<Array<{ referralCode: string }>>`
      SELECT "referralCode" FROM "User" WHERE "id" = ${referrer.id}
    `
    assert.match(codeRows[0].referralCode, /^CLD-[A-F0-9]{12}$/)

    await assert.rejects(
      attributeReferral(referrer.id, referrer.email, codeRows[0].referralCode),
      /Self-referrals are not allowed/,
    )

    const attribution = await attributeReferral(referred.id, referred.email, codeRows[0].referralCode)
    assert.equal(attribution.duplicate, false)
    const duplicate = await attributeReferral(referred.id, referred.email, codeRows[0].referralCode)
    assert.equal(duplicate.duplicate, true)

    const first = await qualifyReferralForUser(referred.id, 'payment:test-reference')
    const second = await qualifyReferralForUser(referred.id, 'payment:test-reference')
    assert.equal(first.rewarded, true)
    assert.equal(second.rewarded, false)
    assert.equal(await getPointBalance(referrer.id), Number(process.env.REFERRAL_REWARD_POINTS ?? 100))

    const rows = await prisma.$queryRaw<Array<{ status: string; reward: number; rewardedAt: Date | null }>>`
      SELECT "status", "reward", "rewardedAt" FROM "Referral" WHERE "id" = ${attribution.id}
    `
    assert.equal(rows[0].status, 'REWARDED')
    assert.equal(rows[0].reward, Number(process.env.REFERRAL_REWARD_POINTS ?? 100))
    assert.ok(rows[0].rewardedAt)
  } finally {
    await prisma.pointLedger.deleteMany({ where: { userId: referrer.id } })
    await prisma.$executeRaw`DELETE FROM "Referral" WHERE "referredUserId" = ${referred.id} OR "userId" = ${referrer.id}`
    await prisma.user.deleteMany({ where: { id: { in: [referrer.id, referred.id] } } })
  }
})
