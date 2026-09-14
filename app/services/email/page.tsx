import { requireUser } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { ServicesComposer } from '../ServicesComposer'

export const dynamic='force-dynamic'
export default async function ServicesEmailPage(){
  const user=await requireUser()
  const membership=await prisma.workspaceMember.findFirst({where:{userId:user.id,status:'ACTIVE'},orderBy:{createdAt:'asc'},select:{workspaceId:true}})
  if(!membership)return <div className="rounded-xl border bg-background p-6">Create or join a workspace to use email services.</div>
  return <div className="mx-auto max-w-6xl space-y-6"><div><p className="text-sm text-muted-foreground">Workspace / Services / Email</p><h1 className="text-3xl font-semibold">Email</h1><p className="mt-1 text-sm text-muted-foreground">Compose and send through Cloudie’s internal SMTP/job pipeline.</p></div><ServicesComposer workspaceId={membership.workspaceId}/></div>
}
