ALTER TABLE "User" ALTER COLUMN "referralCode" DROP NOT NULL;

CREATE OR REPLACE FUNCTION cloudie_assign_referral_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."referralCode" IS NULL OR NEW."referralCode" = '' THEN
    NEW."referralCode" := 'CLD-' || UPPER(SUBSTRING(md5(NEW."id"), 1, 12));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cloudie_assign_referral_code_trigger ON "User";
CREATE TRIGGER cloudie_assign_referral_code_trigger
BEFORE INSERT ON "User"
FOR EACH ROW EXECUTE FUNCTION cloudie_assign_referral_code();
