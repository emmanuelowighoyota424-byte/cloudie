ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "referredUserId" TEXT;
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "attributedAt" TIMESTAMP(3);
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "rewardedAt" TIMESTAMP(3);
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "qualifyingEvent" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_referredUserId_key" ON "Referral"("referredUserId");
CREATE INDEX IF NOT EXISTS "Referral_userId_createdAt_idx" ON "Referral"("userId","createdAt");
