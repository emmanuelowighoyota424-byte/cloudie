'use client'

import { useEffect, useState } from 'react'

interface Product { id: string; name: string; sku: string; description: string | null; price: string | number; stock: number; vendor: { name: string; category: string; status: string } | null }
interface Workspace { id: string; name: string }

export default function MarketplacePage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const workspacesResponse = await fetch('/api/workspaces', { cache: 'no-store' })
        const workspaces = await workspacesResponse.json()
        const selected = workspaces.workspaces?.[0]
        if (!selected) throw new Error('Create or join a workspace to use Marketplace.')
        setWorkspace(selected)
        const response = await fetch(`/api/workspaces/${selected.id}/marketplace?search=${encodeURIComponent(search)}`, { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'Unable to load marketplace')
        setProducts(data.products ?? [])
      } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load marketplace') } finally { setLoading(false) }
    })()
  }, [search])

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header><p className="text-sm font-medium text-primary">Cloudie Marketplace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Products & partners</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Discover products available inside your authorized workspace.</p></header>
        <div className="flex flex-col gap-3 sm:flex-row"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products or SKU…" className="min-h-11 flex-1 rounded-xl border bg-background px-4 outline-none focus:ring-2 focus:ring-primary" /><span className="grid min-h-11 place-items-center rounded-xl border bg-background px-4 text-sm text-muted-foreground">{workspace?.name ?? 'Workspace'}</span></div>
        {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
        {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-48 animate-pulse rounded-2xl border bg-background" />)}</div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{products.map((product) => <article key={product.id} className="rounded-2xl border bg-background p-5 shadow-sm"><div className="aspect-[4/3] rounded-xl bg-muted" /><p className="mt-4 text-xs text-muted-foreground">{product.vendor?.category ?? 'Product'}</p><h2 className="mt-1 font-semibold">{product.name}</h2><p className="mt-1 text-xs text-muted-foreground">SKU {product.sku}</p><p className="mt-4 text-lg font-semibold">₦{Number(product.price).toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{product.stock} available · {product.vendor?.name ?? 'Cloudie vendor'}</p></article>)}{products.length === 0 && <div className="col-span-full rounded-2xl border bg-background p-10 text-center text-sm text-muted-foreground">No products match this search.</div>}</div>}
      </div>
    </main>
  )
}
