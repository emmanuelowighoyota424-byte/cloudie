import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

const plans = ['FREE','STARTER','BUSINESS','ENTERPRISE'] as const
const subscriptionStatuses = ['ACTIVE','TRIALING','PAST_DUE','CANCELED','INCOMPLETE'] as const

export async function POST(request: Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const actor=await requireSuperAdmin(); const {id}=await params; const body=await request.json().catch(()=>null) as Record<string,unknown>|null
    const action=typeof body?.action==='string'?body.action:''
    const workspace=await prisma.workspace.findUnique({where:{id},select:{id:true,plan:true,subscriptionStatus:true}}); if(!workspace)return NextResponse.json({error:'Tenant not found.'},{status:404})
    if(action==='plan'){
      const plan=typeof body?.plan==='string'?body.plan:''; const reason=typeof body?.reason==='string'?body.reason.trim():''
      if(!plans.includes(plan as typeof plans[number])||reason.length<3)return NextResponse.json({error:'Valid plan and reason are required.'},{status:400})
      await prisma.$transaction(async tx=>{await tx.workspace.update({where:{id},data:{plan:plan as typeof plans[number]}});await tx.auditLog.create({data:{actorId:actor.id,workspaceId:id,action:'TENANT_PLAN_CHANGED',entity:'Workspace',entityId:id,metadata:{from:workspace.plan,to:plan,reason}}})})
      return NextResponse.json({ok:true,plan})
    }
    if(action==='subscription'){
      const status=typeof body?.status==='string'?body.status:''; const reason=typeof body?.reason==='string'?body.reason.trim():''
      if(!subscriptionStatuses.includes(status as typeof subscriptionStatuses[number])||reason.length<3)return NextResponse.json({error:'Valid subscription status and reason are required.'},{status:400})
      await prisma.$transaction(async tx=>{await tx.workspace.update({where:{id},data:{subscriptionStatus:status as typeof subscriptionStatuses[number]}});await tx.auditLog.create({data:{actorId:actor.id,workspaceId:id,action:'TENANT_SUBSCRIPTION_CHANGED',entity:'Workspace',entityId:id,metadata:{from:workspace.subscriptionStatus,to:status,reason}}})})
      return NextResponse.json({ok:true,subscriptionStatus:status})
    }
    if(action==='member'){
      const memberId=typeof body?.memberId==='string'?body.memberId:''; const status=body?.status; const reason=typeof body?.reason==='string'?body.reason.trim():''
      if(!memberId||!['ACTIVE','SUSPENDED'].includes(String(status))||reason.length<3)return NextResponse.json({error:'Valid member, status and reason are required.'},{status:400})
      const member=await prisma.workspaceMember.findFirst({where:{id:memberId,workspaceId:id},select:{id:true,status:true}}); if(!member)return NextResponse.json({error:'Member not found.'},{status:404})
      await prisma.$transaction(async tx=>{await tx.workspaceMember.update({where:{id:memberId},data:{status:status as 'ACTIVE'|'SUSPENDED'}});await tx.auditLog.create({data:{actorId:actor.id,workspaceId:id,action:status==='SUSPENDED'?'TENANT_MEMBER_SUSPENDED':'TENANT_MEMBER_REACTIVATED',entity:'WorkspaceMember',entityId:memberId,metadata:{from:member.status,to:status,reason}}})})
      return NextResponse.json({ok:true,status})
    }
    return NextResponse.json({error:'Invalid action.'},{status:400})
  } catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Operation failed.'},{status:500})}
}
