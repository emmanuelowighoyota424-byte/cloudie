import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_request: Request, { params }: { params: Promise<{ trackingNumber: string }> }) {
  const { trackingNumber } = await params
  const normalized = trackingNumber.trim().toUpperCase()
  if (!/^CLD-[A-F0-9]{8,10}$/.test(normalized)) return NextResponse.json({ error: 'Invalid tracking number' }, { status: 400 })

  const shipment = await prisma.shipment.findUnique({
    where: { trackingId: normalized },
    select: {
      trackingId: true,
      origin: true,
      destination: true,
      status: true,
      createdAt: true,
      deliveredAt: true,
      events: { select: { status: true, location: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
    },
  })

  if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
  return NextResponse.json({ shipment }, { headers: { 'Cache-Control': 'private, no-store' } })
}
