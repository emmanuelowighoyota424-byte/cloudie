import { PrismaClient, ShipmentStatus, UserRole } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: 'admin@cloudie.app' },
    update: { role: UserRole.ADMIN },
    create: { email: 'admin@cloudie.app', name: 'Cloudie Admin', role: UserRole.ADMIN },
  })

  await prisma.shipment.createMany({
    data: [
      { trackingId: 'CLD-4829', userId: admin.id, customer: 'Northstar Labs', origin: 'Lagos', destination: 'London', status: ShipmentStatus.IN_TRANSIT },
      { trackingId: 'CLD-4828', userId: admin.id, customer: 'Kora Supply Co.', origin: 'Accra', destination: 'New York', status: ShipmentStatus.DELIVERED },
      { trackingId: 'CLD-4827', userId: admin.id, customer: 'Mira Studios', origin: 'Nairobi', destination: 'Berlin', status: ShipmentStatus.PENDING },
    ],
    skipDuplicates: true,
  })

  await prisma.pointLedger.createMany({
    data: [
      { userId: admin.id, amount: 2500, balance: 18420, description: 'Wallet top-up', reference: 'SEED-TOPUP' },
      { userId: admin.id, amount: 240, balance: 15920, description: 'Referral reward', reference: 'CLD-4828' },
      { userId: admin.id, amount: -120, balance: 15680, description: 'Shipment creation', reference: 'CLD-4829' },
    ],
    skipDuplicates: true,
  })
}

main().finally(() => prisma.$disconnect())
