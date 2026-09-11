import Link from 'next/link'

const features = [
  ['Shipments', 'Create, assign, track, and deliver shipments with a complete event history.'],
  ['Documents', 'Keep operational documents attached to the right workspace with controlled access.'],
  ['Marketplace', 'Manage customers, vendors, products, orders, and fulfillment from one workspace.'],
  ['Analytics', 'Measure shipment activity, customers, orders, and verified revenue from PostgreSQL.'],
  ['Team workspaces', 'Invite members and enforce roles and tenant isolation server-side.'],
  ['Security', 'Better Auth sessions, workspace authorization, audit events, and privacy-safe tracking.'],
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-lg font-semibold tracking-tight">cloudie<span className="text-primary">.</span></Link>
          <nav className="flex items-center gap-2"><Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted">Sign in</Link><Link href="/register" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm">Get started</Link></nav>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-4 pb-20 pt-20 sm:px-6 lg:px-8 lg:pt-28">
        <div className="max-w-3xl"><span className="inline-flex rounded-full border bg-muted px-3 py-1 text-xs font-medium">Operations, logistics & commerce in one workspace</span><h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">Run your business from one secure workspace.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">Cloudie brings shipments, customers, vendors, documents, orders, analytics, and team permissions together without sacrificing tenant isolation or operational control.</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link href="/register" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 font-medium text-primary-foreground">Create your workspace</Link><Link href="/track/" className="inline-flex min-h-11 items-center justify-center rounded-lg border px-5 font-medium hover:bg-muted">Track a shipment</Link></div></div>
        <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{features.map(([title, description]) => <article key={title} className="rounded-2xl border bg-card p-6 shadow-sm"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></article>)}</div>
      </section>
      <section className="border-y bg-muted/40"><div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"><div className="grid gap-8 lg:grid-cols-3"><div><p className="text-sm font-medium">Built for teams</p><p className="mt-2 text-2xl font-semibold">One source of truth for operations.</p></div><div><p className="text-sm leading-6 text-muted-foreground">Every workspace has its own members, resources, audit history, and authorization boundary. A user cannot access another workspace merely by knowing an ID.</p></div><div><p className="text-sm leading-6 text-muted-foreground">Start free, invite your team, create your first shipment, and grow into marketplace and analytics workflows as your operation expands.</p></div></div></div></section>
      <footer className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><span>© {new Date().getFullYear()} Cloudie</span><div className="flex gap-4"><Link href="/login" className="hover:text-foreground">Sign in</Link><Link href="/register" className="hover:text-foreground">Register</Link></div></footer>
    </main>
  )
}
