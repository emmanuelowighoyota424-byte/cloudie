import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/authorization'
import TenantControls from './TenantControls'

export const dynamic='force-dynamic'
export default async function TenantAdmin({params}:{params:Promise<{id:string}>}){
  await requireSuperAdmin(); const {id}=await params
  const w=await prisma.workspace.findUnique({where:{id},include:{owner:{select:{name:true,email:true}},members:{orderBy:{createdAt:'asc'},include:{user:{select:{name:true,email:true}}}},subscription:true,_count:{select:{shipments:true,documents:true,products:true,orders:true,customers:true,vendors:true}}})
  if(!w)notFound()
  return <div className="mx-auto max-w-6xl space-y-6"><div><Link href="/admin/tenants" className="text-sm text-muted-foreground hover:underline">← Business tenants</Link><h1 className="mt-2 text-2xl font-semibold">{w.name}</h1><p className="text-sm text-muted-foreground">{w.slug} · {w.id}</p></div><div className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Plan</p><p className="font-semibold">{w.plan}</p></div><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Subscription</p><p className="font-semibold">{w.subscriptionStatus}</p></div><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Owner</p><p className="font-semibold">{w.owner.email}</p></div><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Members</p><p className="font-semibold">{w.members.length}</p></div></div><TenantControls tenantId={w.id} plan={w.plan} subscriptionStatus={w.subscriptionStatus} members={w.members.map(m=>({id:m.id,name:m.user.name,email:m.user.email,status:m.status}))}/><section className="rounded-xl border"><div className="border-b p-4"><h2 className="font-semibold">Tenant resources</h2></div><div className="grid gap-3 p-4 sm:grid-cols-5">{Object.entries(w._count).map(([k,v])=><div key={k} className="rounded-lg bg-muted/30 p-3"><p className="text-xs capitalize text-muted-foreground">{k}</p><p className="text-lg font-semibold">{v}</p></div>)}</div></section></div>
}
