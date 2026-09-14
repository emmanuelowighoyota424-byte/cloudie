ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
UPDATE "User" SET "referralCode" = 'CLD-' || UPPER(SUBSTRING(md5("id"), 1, 12)) WHERE "referralCode" IS NULL;
ALTER TABLE "User" ALTER COLUMN "referralCode" SET NOT NULL;
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

ALTER TABLE "Referral" ADD COLUMN "code" TEXT;
ALTER TABLE "Referral" ADD COLUMN "referredUserId" TEXT;
ALTER TABLE "Referral" ADD COLUMN "qualifyingEvent" TEXT;
ALTER TABLE "Referral" ADD COLUMN "attributedAt" TIMESTAMP(3);
ALTER TABLE "Referral" ADD COLUMN "rewardedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Referral_code_key" ON "Referral"("code");
CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");
CREATE INDEX "Referral_status_createdAt_idx" ON "Referral"("status", "createdAt");
CREATE INDEX "Referral_referredUserId_idx" ON "Referral"("referredUserId");
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
