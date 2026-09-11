import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function TrackingPage({ params }: { params: Promise<{ trackingNumber: string }> }) {
  const { trackingNumber } = await params
  const shipment = await prisma.shipment.findUnique({
    where: { trackingId: trackingNumber.toUpperCase() },
    select: {
      trackingId: true,
      status: true,
      origin: true,
      destination: true,
      createdAt: true,
      deliveredAt: true,
      events: { select: { status: true, location: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
    },
  })
  if (!shipment) notFound()

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-12 sm:px-6">
      <div className="rounded-2xl border bg-background p-6 shadow-sm sm:p-8">
        <p className="text-sm font-medium text-muted-foreground">Cloudie Shipment Tracking</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{shipment.trackingId}</h1>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Status</p><p className="mt-1 font-medium">{shipment.status.replaceAll('_', ' ')}</p></div>
          <div><p className="text-xs text-muted-foreground">From</p><p className="mt-1 font-medium">{shipment.origin}</p></div>
          <div><p className="text-xs text-muted-foreground">To</p><p className="mt-1 font-medium">{shipment.destination}</p></div>
        </div>
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Shipment history</h2>
          <ol className="mt-4 space-y-4">
            {shipment.events.map((event) => (
              <li key={`${event.createdAt.toISOString()}-${event.status}`} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{event.status.replaceAll('_', ' ')}</span>
                  <time className="text-sm text-muted-foreground">{event.createdAt.toLocaleString()}</time>
                </div>
                {event.location && <p className="mt-1 text-sm text-muted-foreground">{event.location}</p>}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  )
}
