import { NextResponse } from 'next/server'
import { requireWorkspaceRole } from '@/lib/authorization'
import { chargeForAction } from '@/lib/billing'
import { creditPoints } from '@/lib/points'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : ''
    if (!workspaceId) return NextResponse.json({error:'workspaceId is required'},{status:400})
    const { user } = await requireWorkspaceRole(workspaceId,['SUPER_ADMIN','WORKSPACE_ADMIN'])
    const workspace = await prisma.workspace.findUnique({where:{id:workspaceId},include:{subscription:true}})
    if (!workspace) return NextResponse.json({error:'Tenant not found'},{status:404})
    const currentEnd = workspace.subscription?.currentPeriodEnd && workspace.subscription.currentPeriodEnd.getTime()>Date.now() ? workspace.subscription.currentPeriodEnd : new Date()
    const renewalDate = new Date(currentEnd); renewalDate.setUTCDate(renewalDate.getUTCDate()+30)
    const reference = `tenant:renew:${workspaceId}:${renewalDate.toISOString().slice(0,10)}`
    const charge = await chargeForAction({userId:user.id,workspaceId,action:'tenant.renewal',description:'Tenant portal renewal',reference})
    try {
      await prisma.$transaction(async tx => {
        await tx.workspace.update({where:{id:workspaceId},data:{subscriptionStatus:'ACTIVE'}})
        if (workspace.subscription) await tx.subscription.update({where:{workspaceId},data:{status:'ACTIVE',currentPeriodStart:currentEnd,currentPeriodEnd:renewalDate}})
        else await tx.subscription.create({data:{workspaceId,plan:workspace.plan,status:'ACTIVE',currentPeriodStart:currentEnd,currentPeriodEnd:renewalDate}})
        await tx.$executeRaw`UPDATE "TenantProfile" SET "renewalDate"=${renewalDate},"lockedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "workspaceId"=${workspaceId}`
        await tx.notification.create({data:{userId:user.id,workspaceId,title:'Tenant renewed',message:`${workspace.name} has been renewed through ${renewalDate.toISOString().slice(0,10)}.`,type:'SYSTEM'}})
        await tx.auditLog.create({data:{actorId:user.id,userId:user.id,workspaceId,action:'TENANT_RENEWED',entity:'Workspace',entityId:workspaceId,result:'SUCCESS',metadata:{renewalDate:renewalDate.toISOString(),pointsCharged:charge.amount}}})
      })
      return NextResponse.json({ok:true,workspaceId,renewalDate,pointsCharged:charge.amount})
    } catch (error) {
      if(charge.amount>0&&!charge.idempotent) await creditPoints({userId:user.id,amount:charge.amount,description:'Refund for failed tenant renewal',reference:`${reference}:rollback`,workspace:workspaceId}).catch(()=>{})
      throw error
    }
  } catch(error){const message=error instanceof Error?error.message:'Unable to renew tenant';const status=message.includes('Insufficient points')?402:message.includes('Authentication')?401:message.includes('access')?403:500;return NextResponse.json({error:message},{status})}
}
