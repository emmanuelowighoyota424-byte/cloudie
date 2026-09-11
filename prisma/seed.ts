import { PrismaClient, MembershipRole, PointEntryType, ShipmentStatus, UserRole } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: 'admin@cloudie.app' },
    update: { role: UserRole.ADMIN },
    create: { email: 'admin@cloudie.app', name: 'Cloudie Admin', role: UserRole.ADMIN },
  })

  const workspace = await prisma.workspace.upsert({
    where: { slug: 'acme-corporation' },
    update: { name: 'Acme Corporation' },
    create: { name: 'Acme Corporation', slug: 'acme-corporation' },
  })

  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: admin.id } },
    update: { role: MembershipRole.OWNER },
    create: { workspaceId: workspace.id, userId: admin.id, role: MembershipRole.OWNER },
  })

  const account = await prisma.pointAccount.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: admin.id } },
    update: { balance: 2620, version: 3 },
    create: { workspaceId: workspace.id, userId: admin.id, balance: 2620, version: 3 },
  })

  await prisma.shipment.createMany({
    data: [
      { trackingId: 'CLD-4829', userId: admin.id, workspaceId: workspace.id, customer: 'Northstar Labs', origin: 'Lagos', destination: 'London', status: ShipmentStatus.IN_TRANSIT },
      { trackingId: 'CLD-4828', userId: admin.id, workspaceId: workspace.id, customer: 'Kora Supply Co.', origin: 'Accra', destination: 'New York', status: ShipmentStatus.DELIVERED },
      { trackingId: 'CLD-4827', userId: admin.id, workspaceId: workspace.id, customer: 'Mira Studios', origin: 'Nairobi', destination: 'Berlin', status: ShipmentStatus.PENDING },
    ],
    skipDuplicates: true,
  })

  await prisma.pointLedger.createMany({
    data: [
      { userId: admin.id, workspaceId: workspace.id, pointAccountId: account.id, type: PointEntryType.CREDIT, amount: 2500, balance: 2500, description: 'Wallet top-up', reference: 'SEED-TOPUP', idempotencyKey: 'seed-topup-v2' },
      { userId: admin.id, workspaceId: workspace.id, pointAccountId: account.id, type: PointEntryType.CREDIT, amount: 240, balance: 2740, description: 'Referral reward', reference: 'CLD-4828', idempotencyKey: 'seed-referral-v2' },
      { userId: admin.id, workspaceId: workspace.id, pointAccountId: account.id, type: PointEntryType.DEBIT, amount: -120, balance: 2620, description: 'Shipment creation', reference: 'CLD-4829', idempotencyKey: 'seed-shipment-v2' },
    ],
    skipDuplicates: true,
  })
}

main().finally(() => prisma.$disconnect())
