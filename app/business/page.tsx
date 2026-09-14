import { requireUser } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { BusinessSuiteClient } from './BusinessSuiteClient'
export const dynamic='force-dynamic'
export default async function BusinessPage(){const user=await requireUser();const memberships=await prisma.workspaceMember.findMany({where:{userId:user.id,status:'ACTIVE'},include:{workspace:true},orderBy:{createdAt:'asc'}});return <BusinessSuiteClient workspaces={memberships.map(m=>({id:m.workspaceId,name:m.workspace.name,slug:m.workspace.slug,plan:m.workspace.plan,subscriptionStatus:m.workspace.subscriptionStatus,role:m.role}))}/>}
