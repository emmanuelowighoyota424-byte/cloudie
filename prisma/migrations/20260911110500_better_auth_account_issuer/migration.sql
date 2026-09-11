-- Better Auth 1.7.2 requires an issuer column on Account.
-- Keep it nullable so existing production account rows remain valid during the non-destructive cutover.
ALTER TABLE "Account" ADD COLUMN "issuer" TEXT;

-- Better Auth 1.7.x uses issuer + accountId as an account identity key.
CREATE UNIQUE INDEX "Account_issuer_accountId_key" ON "Account"("issuer", "accountId");
