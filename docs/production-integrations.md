# Cloudie production integrations

## Private documents

Cloudie uses authenticated Vercel Blob storage for private documents. Configure `BLOB_READ_WRITE_TOKEN` in the Vercel Production environment. Uploads are server-authorized, tenant-scoped, type/size validated, and never exposed as public blob URLs.

The current server upload endpoint intentionally caps uploads at 4 MiB so the request remains within the platform server-upload envelope. Larger files should use a future client-upload/presigned flow without changing the document authorization layer.

## Payments

Payment state is never accepted from the browser. Configure `PAYMENT_WEBHOOK_SECRET` and connect the provider's webhook to `/api/webhooks/payments`. The webhook must send `x-payment-provider`, `x-payment-event-id`, and an HMAC-SHA256 `x-payment-signature` over the raw request body. Cloudie verifies the order amount, records a unique provider event, and only then advances payment/order state.

A real payment provider account and credentials are required before payment acceptance can be enabled in production; Cloudie does not create fake successful payments.

## Database migrations

The Prisma schema is validated and generated in CI. Production database rollout must use reviewed Prisma migrations with `prisma migrate deploy` against the actual production `DATABASE_URL`. Do not use `prisma db push` for production.
