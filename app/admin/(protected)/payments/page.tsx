import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

export default async function AdminPaymentsPage() {
  try { await requireSuperAdmin() } catch { redirect('/dashboard') }
  const payments = await prisma.payment.findMany({ include: { order: { select: { id: true, workspaceId: true, userId: true, total: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })
  return <main className="min-h-screen bg-muted/40 px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><p className="text-sm text-muted-foreground">Platform administration</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Payments</h1><div className="mt-6 overflow-x-auto rounded-2xl border bg-card"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b bg-muted/30"><tr>{['Reference','Order','Workspace','Provider','Amount','Status','Created','Verified'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody className="divide-y">{payments.map((payment) => <tr key={payment.id}><td className="px-4 py-3 font-mono text-xs">{payment.providerReference || '—'}</td><td className="px-4 py-3 font-mono text-xs">{payment.order.id}</td><td className="px-4 py-3 font-mono text-xs">{payment.order.workspaceId}</td><td className="px-4 py-3">{payment.provider}</td><td className="px-4 py-3">{payment.currency} {payment.amount.toString()}</td><td className="px-4 py-3">{payment.status}</td><td className="px-4 py-3">{payment.createdAt.toLocaleString()}</td><td className="px-4 py-3">{payment.verifiedAt?.toLocaleString() || '—'}</td></tr>)}</tbody></table>{payments.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">No payments recorded.</div>}</div></div></main>
}
