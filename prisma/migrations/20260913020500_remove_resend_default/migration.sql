ALTER TABLE "EmailMessage" ALTER COLUMN "provider" SET DEFAULT 'smtp';
UPDATE "EmailMessage" SET "provider" = 'smtp' WHERE "provider" = 'resend';
