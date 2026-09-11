import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const REQUIRED_TABLES = [
  'User','Account','Session','Verification','Workspace','WorkspaceMember','WorkspaceInvitation','Shipment','ShipmentEvent','Customer','Driver','Warehouse','ProofOfDelivery','Document','DocumentVersion','DocumentShare','DocumentAccess','Vendor','Product','Order','OrderItem','Payment','WebhookEvent','Subscription','Notification','Referral','AuditLog','KYCVerification','PointLedger','MarketplaceDispute','PointPricingRule','CloudieJob','EmailMessage','EmailCampaign','CloudieAsset','CryptoDeposit','KYCEvent','BusinessInvoice','BusinessDepartment','BusinessStaff','KYCSubmission',
]

function configState(value: string | undefined) {
  return value ? 'configured' : 'not_configured'
}

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY(${REQUIRED_TABLES})`
    const present = new Set(rows.map((row) => row.table_name))
    const missingTables = REQUIRED_TABLES.filter((table) => !present.has(table))
    const migrationRows = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM information_schema.tables WHERE table_schema='public' AND table_name='_prisma_migrations'`
    const migrationsTablePresent = Number(migrationRows[0]?.count ?? 0) > 0
    const checks = {
      database: 'healthy',
      prisma: 'healthy',
      migrations: migrationsTablePresent ? 'healthy' : 'unavailable',
      storage: configState(process.env.BLOB_READ_WRITE_TOKEN || process.env.S3_ENDPOINT),
      email: process.env.EMAIL_PROVIDER && process.env.EMAIL_API_KEY && process.env.EMAIL_FROM ? 'configured' : 'not_configured',
      redis: configState(process.env.REDIS_URL),
      jobs: process.env.JOBS_RUNNER_SECRET ? 'configured' : 'unavailable',
      paystack: process.env.PAYSTACK_SECRET_KEY ? 'configured' : 'not_configured',
      crypto: process.env.CRYPTO_PROVIDER_KEY ? 'configured' : 'not_configured',
    }
    const degraded = Object.values(checks).some((value) => ['unavailable'].includes(value)) || missingTables.length > 0
    return NextResponse.json({ status: missingTables.length ? 'unavailable' : degraded ? 'degraded' : 'healthy', checks, schema: missingTables.length ? 'incomplete' : 'ok', missingTables, migrationsTablePresent, timestamp: new Date().toISOString() }, { status: missingTables.length ? 503 : 200 })
  } catch {
    return NextResponse.json({ status: 'unavailable', checks: { database: 'unavailable' }, timestamp: new Date().toISOString() }, { status: 503 })
  }
}
