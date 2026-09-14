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
- Vercel production runtime for the web application
- Vercel Blob/private storage for production assets and documents
- PostgreSQL-backed `CloudieJob` queue with `FOR UPDATE SKIP LOCKED`
- PostgreSQL durable `RealtimeEvent` outbox plus `LISTEN/NOTIFY` wakeups
- Dedicated Node WebSocket push service under `realtime/server.mjs` for persistent WSS
- Paystack as the intentional external payment integration

The repository does not require Fastify, Express, FastAPI, Redis, Socket.io, S3, Resend, SendGrid or Twilio for its core architecture.

## Authentication and authorization
Authentication is session-based through Better Auth. Server routes resolve the authenticated user and then validate workspace membership/permissions or Super Admin status. Client-side navigation is never treated as an authorization boundary.

Workspace data is always queried with an authenticated workspace scope. Private documents and tenant records are ownership/membership checked server-side. WebSocket tickets are short-lived, single-use and bound to an authenticated Better Auth session and optional workspace membership.

## Workspaces
### Personal
Unified dashboard, points wallet, transaction history, marketplace orders, crypto deposit history/address flow, referrals, notifications, documents and profile/security views.

### Shipments
Workspace-scoped shipment creation, tracking numbers, public tracking, events, driver/warehouse workflows, POD, documents, notifications and points billing.

### Ticketing
Flight, hotel, commercial invoice, receipt, itinerary and customs document generation. Server-side PDF generation persists generated documents, records history and charges points through the centralized billing service with rollback on generation failure.

### Business Suite
Workspace-backed tenant portals with BANK/INVESTMENT configuration, tenant-specific branding, tenant membership, isolated tenant ledger persistence, KYC/compliance visibility, domain records and administrative site lockdown.

### Services
Tenant-scoped email campaigns and notification history backed by the durable PostgreSQL job system, plus an internal rendering studio and private asset manager. Email dispatch is charged before queueing and terminal failures are compensated without charging retries twice.

## Points architecture
`lib/points.ts` is the authoritative mutation layer. Credits and debits use row locking plus PostgreSQL advisory locks for idempotency/concurrency safety. The ledger stores signed amounts and supports workspace attribution. Billable actions resolve their price through persisted `PointPricingRule` records in `lib/billing.ts`; pricing supports a validated quantity multiplier.

Default platform rules are seeded by migrations and can be overridden by Super Admin pricing controls.

## Jobs
The production job flow is:

`Vercel Cron → /api/jobs/worker → JOBS_RUNNER_SECRET → CloudieJob → FOR UPDATE SKIP LOCKED → PROCESSING → COMPLETED / retry / FAILED`

Email delivery and scheduled campaigns use this queue. Job execution is idempotent and retry-aware. Terminally failed billed email work is compensated using an idempotent refund reference.

## Payments
Paystack requests are verified server-side. Webhooks use HMAC verification and persistent event/idempotency records. Client-side payment success is never authoritative.

## Documents and storage
Documents are private by default. Generated PDFs are persisted as application documents and linked to their source records. Access events are recorded. Production storage uses the existing private storage abstraction and Vercel Blob; CI can use filesystem storage.

## Real-time architecture
The production realtime path is:

`Cloudie Web/PWA → HTTPS ticket endpoint → WSS /ws → dedicated Node push service → PostgreSQL LISTEN/NOTIFY + durable RealtimeEvent outbox → application/database mutations`

Database triggers write durable, non-sensitive event metadata to `RealtimeEvent` and emit a PostgreSQL notification as a low-latency wakeup. The outbox remains the recovery source after process restarts. The WebSocket service authenticates a single-use ticket, verifies the backing Better Auth session and workspace membership, authorizes every event against the current database state, and sends only authorized events. Clients persist an event cursor and request replay after reconnect. The current event set includes points, notifications, orders, order chat, shipments, payments, crypto deposits, referrals, tenants, KYC, documents and jobs.

Order live chat is persisted in `OrderChatConversation`, `OrderChatParticipant` and `OrderChatMessage`; messages are idempotent by client message ID and realtime delivery is participant-scoped.

## PWA
The application exposes a manifest and registers `/sw.js`. The service worker caches only a public offline shell and never caches authenticated dashboard, admin, API or tenant-private routes. Offline fallback explicitly avoids persisting sensitive account data in browser storage.

## Security
- Server-side RBAC and workspace membership checks
- Tenant isolation on all tenant-facing queries
- Ownership checks for private documents and customer resources
- Atomic point mutations and idempotency references
- Payment webhook signature verification and replay protection
- Durable job locking/retries
- Durable realtime outbox with subscription/event authorization
- Origin filtering on WSS connections
- Parameterized SQL/Prisma queries and bounded request payloads
- Append-only audit records for privileged changes
- No secrets in client bundles or user-facing errors

## Database and migrations
Production changes are delivered through ordered Prisma migrations. Migration-only operational tables are queried with parameterized Prisma SQL where the existing Prisma schema intentionally does not expose those tables. Realtime and chat operational tables have database indexes and foreign keys. Migrations are non-destructive unless a future migration explicitly requires a reviewed data migration.

## Testing and CI
GitHub Actions validates Prisma schema/generation/migrations, tests, TypeScript, static lint, production build and security/concurrency E2E suites against PostgreSQL 17. The E2E suite covers tenant isolation, platform concurrency, webhook/job concurrency, acceptance gates, KYC/document/PDF storage, admin authorization, realtime authorization and marketplace/business/asset workflows.

## Required production environment
At minimum production requires the configured PostgreSQL connection, Better Auth secret/URL, Cloudie production app URL, private storage credentials/connection, payment credentials/webhook secret, SMTP configuration used by the existing email abstraction, `JOBS_RUNNER_SECRET` for the cron worker, and `NEXT_PUBLIC_REALTIME_URL` pointing at the deployed WSS service. The realtime service requires the same database connection and an allow-list containing the Cloudie web origin. Server-only secrets must never use `NEXT_PUBLIC_*`.
