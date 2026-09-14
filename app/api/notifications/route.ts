import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
export async function POST(request:Request){try{const user=await requireUser();const body=await request.json().catch(()=>null) as Record<string,unknown>|null;const id=typeof body?.id==='string'?body.id:'';if(!id)return NextResponse.json({error:'id is required'},{status:400});const result=await prisma.notification.updateMany({where:{id,userId:user.id,readAt:null},data:{readAt:new Date()}});return NextResponse.json({updated:result.count})}catch(error){const message=error instanceof Error?error.message:'Unable to update notification';return NextResponse.json({error:message},{status:message==='Authentication required'?401:500})}}
