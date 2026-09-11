import { requireSuperAdmin } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

export default async function AdminVendorsPage() {
  await requireSuperAdmin()
  const vendors = await prisma.vendor.findMany({ include: { workspace: { select: { name: true, slug: true } }, products: { select: { id: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><header><p className="text-sm font-medium text-primary">Administration</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Vendors</h1><p className="mt-2 text-sm text-muted-foreground">Review vendor onboarding and lifecycle state.</p></header><div className="mt-8 overflow-hidden rounded-2xl border bg-background"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b bg-muted/40"><tr><th className="px-5 py-3 text-left font-medium">Vendor</th><th className="px-5 py-3 text-left font-medium">Workspace</th><th className="px-5 py-3 text-left font-medium">Products</th><th className="px-5 py-3 text-left font-medium">Status</th></tr></thead><tbody className="divide-y">{vendors.map((vendor) => <tr key={vendor.id}><td className="px-5 py-4 font-medium">{vendor.name}<div className="text-xs text-muted-foreground">{vendor.category}</div></td><td className="px-5 py-4">{vendor.workspace.name}</td><td className="px-5 py-4">{vendor.products.length}</td><td className="px-5 py-4"><span className="rounded-full border px-2.5 py-1 text-xs">{vendor.status}</span></td></tr>)}{vendors.length === 0 && <tr><td colSpan={4} className="px-5 py-12 text-center text-muted-foreground">No vendors found.</td></tr>}</tbody></table></div></div></div></main>
  )
}
