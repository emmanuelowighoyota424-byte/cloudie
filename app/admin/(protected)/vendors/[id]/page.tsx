import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/authorization'
import VendorControls from './VendorControls'

export const dynamic = 'force-dynamic'

export default async function VendorAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin()
  const { id } = await params
  const vendor = await prisma.vendor.findUnique({ where: { id }, include: { workspace: { select: { id: true, name: true, slug: true } }, products: { orderBy: { createdAt: 'desc' }, take: 25, select: { id: true, name: true, sku: true, price: true, stock: true, active: true } } } })
  if (!vendor) notFound()
  return <div className="mx-auto max-w-6xl space-y-6">
    <div><Link href="/admin/vendors" className="text-sm text-muted-foreground hover:underline">← Vendors</Link><h1 className="mt-2 text-2xl font-semibold">{vendor.name}</h1><p className="text-sm text-muted-foreground">{vendor.category} · {vendor.workspace.name} · {vendor.id}</p></div>
    <VendorControls vendorId={vendor.id} status={vendor.status} />
    <section className="rounded-xl border bg-background"><div className="border-b p-4"><h2 className="font-semibold">Products</h2></div><div className="divide-y">{vendor.products.map(p => <div key={p.id} className="flex items-center justify-between gap-4 p-4 text-sm"><div><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.sku}</p></div><div className="text-right">{p.price.toString()} · stock {p.stock} · {p.active ? 'ACTIVE' : 'INACTIVE'}</div></div>)}{!vendor.products.length && <div className="p-6 text-sm text-muted-foreground">No products.</div>}</div></section>
  </div>
}
