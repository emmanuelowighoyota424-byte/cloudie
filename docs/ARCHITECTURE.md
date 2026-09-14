# Cloudie — Production Architecture

## Product model
Cloudie is a multi-workspace SaaS with one authenticated account, shared authorization/audit controls and a unified usage-based points ledger. The product surfaces are Personal, Shipments, Ticketing, Business Suite and Services.

## Runtime architecture
- Next.js App Router 16.x
- React 19
- TypeScript
- Prisma 6.x
- PostgreSQL/Neon
- Better Auth
- Vercel production runtime
- Vercel Blob/private storage for production assets and documents
- PostgreSQL-backed `CloudieJob` queue with `FOR UPDATE SKIP LOCKED`
- Paystack as the intentional external payment integration

The repository does not require Fastify, Express, FastAPI, Redis, Socket.io, S3, Resend, SendGrid or Twilio for its core architecture.

## Authentication and authorization
Authentication is session-based through Better Auth. Server routes resolve the authenticated user and then validate workspace membership/permissions or Super Admin status. Client-side navigation is never treated as an authorization boundary.

Workspace data is always queried with an authenticated workspace scope. Private documents and tenant records are ownership/membership checked server-side.

## Workspaces
### Personal
Unified dashboard, points wallet, transaction history, marketplace orders, crypto deposit history/address flow, referrals, notifications, documents and profile/security views.

### Shipments
Workspace-scoped shipment creation, tracking numbers, public tracking, events, driver/warehouse workflows, POD, documents, notifications and points billing.

### Ticketing
Flight, hotel, commercial invoice and customs document builders. Server-side PDF generation persists generated documents, records history and charges points through the centralized billing service.

### Business Suite
Workspace-backed tenant portals with BANK/INVESTMENT configuration, tenant-specific branding, tenant membership, isolated tenant ledger persistence, KYC/compliance visibility, domain records and administrative site lockdown.

### Services
Tenant-scoped email campaigns and notification history backed by the durable PostgreSQL job system, plus an internal rendering studio and private asset manager.

## Points architecture
`lib/points.ts` is the authoritative mutation layer. Credits and debits use row locking plus PostgreSQL advisory locks for idempotency/concurrency safety. The ledger stores signed amounts and supports workspace attribution. Billable actions resolve their price through persisted `PointPricingRule` records in `lib/billing.ts` rather than hard-coded prices in product workflows.

Default platform rules are seeded by migrations and can be overridden by Super Admin pricing controls.

## Jobs
The production job flow is:

`Vercel Cron → /api/jobs/worker → JOBS_RUNNER_SECRET → CloudieJob → FOR UPDATE SKIP LOCKED → PROCESSING → COMPLETED / retry / FAILED`

Email delivery and scheduled campaigns use this queue. Job execution is idempotent and retry-aware.

## Payments
Paystack requests are verified server-side. Webhooks use HMAC verification and persistent event/idempotency records. Client-side payment success is never authoritative.

## Documents and storage
Documents are private by default. Generated PDFs are persisted as application documents and linked to their source records. Access events are recorded. Production storage uses the existing private storage abstraction and Vercel Blob; CI can use filesystem storage.

## Real-time/update strategy
Cloudie favors its existing Next.js/PostgreSQL deployment model. Server-backed refresh/revalidation and existing realtime API infrastructure are used instead of adding Redis/Socket.io solely to reproduce the original design document.

## PWA
The application exposes a manifest and registers `/sw.js`. The service worker caches only a public offline shell and never caches authenticated dashboard, admin, API or tenant-private routes. Offline fallback explicitly avoids persisting sensitive account data in browser storage.

## Security
- Server-side RBAC and workspace membership checks
- Tenant isolation on all tenant-facing queries
- Ownership checks for private documents and customer resources
- Atomic point mutations and idempotency references
- Payment webhook signature verification and replay protection
- Durable job locking/retries
- Append-only audit records for privileged changes
- No secrets in client bundles or user-facing errors

## Database and migrations
Production changes are delivered through ordered Prisma migrations. Migration-only operational tables may be queried with parameterized Prisma SQL where the existing Prisma schema intentionally does not expose those tables. Migrations are non-destructive unless a future migration explicitly requires a reviewed data migration.

## Testing and CI
GitHub Actions validates Prisma schema/generation/migrations, tests, TypeScript, production build and security/concurrency E2E suites against PostgreSQL 17. The E2E suite covers tenant isolation, platform concurrency, webhook/job concurrency, acceptance gates, KYC/document/PDF storage, admin authorization, realtime authorization and marketplace/business/asset workflows.

## Required production environment
At minimum production requires the configured PostgreSQL connection, Better Auth secret/URL, Cloudie production app URL, private storage credentials/connection, payment credentials/webhook secret, SMTP configuration used by the existing email abstraction, and `JOBS_RUNNER_SECRET` for the cron worker. Exact variable names remain defined by the repository's runtime configuration; server-only secrets must never use `NEXT_PUBLIC_*`.
