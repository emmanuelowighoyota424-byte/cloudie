import { requireUser } from '@/lib/authorization'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { BusinessConfigClient } from './BusinessConfigClient'
export const dynamic='force-dynamic'
type Plan={id:string;name:string;currency:string;minimumAmount:string;termDays:number;status:string}
type Billing={id:string;workspaceId:string;renewalPoints:number;autoRenew:boolean;status:string;updatedAt:Date}
type Profile={siteType:string;siteTitle:string|null;renewalDate:Date|null}
type Domain={id:string;hostname:string;status:string;verifiedAt:Date|null;active:boolean}
export default async function BusinessConfigPage(){const user=await requireUser();const membership=await prisma.workspaceMember.findFirst({where:{userId:user.id,status:'ACTIVE'},orderBy:{createdAt:'asc'},select:{workspaceId:true}});if(!membership)return <div className="rounded-xl border bg-background p-6">No active workspace.</div>;const [plans,billing,profile,domains]=await Promise.all([prisma.$queryRaw<Plan[]>(Prisma.sql`SELECT "id","name","currency","minimumAmount"::text AS "minimumAmount","termDays","status" FROM "BusinessInvestmentPlan" WHERE "workspaceId"=${membership.workspaceId} ORDER BY "createdAt" DESC`),prisma.$queryRaw<Billing[]>(Prisma.sql`SELECT "id","workspaceId","renewalPoints","autoRenew","status","updatedAt" FROM "BusinessBillingConfig" WHERE "workspaceId"=${membership.workspaceId} LIMIT 1`),prisma.$queryRaw<Profile[]>(Prisma.sql`SELECT "siteType","siteTitle","renewalDate" FROM "TenantProfile" WHERE "workspaceId"=${membership.workspaceId} LIMIT 1`),prisma.$queryRaw<Domain[]>(Prisma.sql`SELECT "id","hostname","status","verifiedAt","active" FROM "TenantDomain" WHERE "workspaceId"=${membership.workspaceId} ORDER BY "createdAt" DESC`)]);return <BusinessConfigClient workspaceId={membership.workspaceId} initial={{plans,billing:billing[0]??null,profile:profile[0]??null,domains}}/>}
