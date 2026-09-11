import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const REQUIRED_TABLES = [
  'User', 'Account', 'Session', 'Verification', 'Workspace', 'WorkspaceMember',
  'WorkspaceInvitation', 'Shipment', 'ShipmentEvent', 'Customer', 'Driver',
  'Warehouse', 'ProofOfDelivery', 'Document', 'DocumentVersion', 'DocumentShare',
  'DocumentAccess', 'Vendor', 'Product', 'Order', 'OrderItem', 'Payment',
  'WebhookEvent', 'Subscription', 'Notification', 'Referral', 'AuditLog', 'KYCVerification', 'PointLedger',
]

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY(${REQUIRED_TABLES})
    `
    const present = new Set(rows.map((row) => row.table_name))
    const missingTables = REQUIRED_TABLES.filter((table) => !present.has(table))
    const migrationRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
    `
    const migrationsTablePresent = Number(migrationRows[0]?.count ?? 0) > 0
    if (missingTables.length) {
      return NextResponse.json({ status: 'error', database: 'ok', schema: 'incomplete', missingTables, migrationsTablePresent, timestamp: new Date().toISOString() }, { status: 503 })
    }
    return NextResponse.json({ status: 'ok', database: 'ok', schema: 'ok', migrationsTablePresent, timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ status: 'error', database: 'unavailable', timestamp: new Date().toISOString() }, { status: 503 })
  }
}
