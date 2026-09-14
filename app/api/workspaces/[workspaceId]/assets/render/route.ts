import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireWorkspaceMember } from '@/lib/authorization'
import { chargeForAction } from '@/lib/billing'
import { creditPoints } from '@/lib/points'
import { prisma } from '@/lib/prisma'
import { putPrivateObject } from '@/lib/storage'

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  let charge: Awaited<ReturnType<typeof chargeForAction>> | null = null
  try {
    const { workspaceId } = await context.params
    const { user } = await requireWorkspaceMember(workspaceId)
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const dataUrl = typeof body?.dataUrl === 'string' ? body.dataUrl : ''
    const filename = typeof body?.filename === 'string' ? body.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) : 'cloudie-render.png'
    const width = Number(body?.width); const height = Number(body?.height)
    const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/)
    if (!match) return NextResponse.json({ error: 'A PNG, JPEG or WebP data URL is required' }, { status: 400 })
    const mimeType = match[1]; const bytes = Buffer.from(match[2], 'base64')
    if (bytes.length > 4 * 1024 * 1024) return NextResponse.json({ error: 'Rendered asset exceeds the 4MB limit' }, { status: 413 })
    if (!Number.isInteger(width) || width < 1 || width > 4096 || !Number.isInteger(height) || height < 1 || height > 4096) return NextResponse.json({ error: 'Invalid canvas dimensions' }, { status: 400 })
    const idempotencyKey = typeof body?.idempotencyKey === 'string' ? body.idempotencyKey : crypto.randomUUID()
    charge = await chargeForAction({ userId:user.id, workspaceId, action:'services.image_rendered', description:'Picture Studio image render', reference:`services:image-render:${idempotencyKey}` })
    try {
      const storageKey=`workspaces/${workspaceId}/assets/rendered/${crypto.randomUUID()}-${filename}`
      const blob=await putPrivateObject(storageKey,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,mimeType)
      await prisma.$executeRaw(Prisma.sql`INSERT INTO "CloudieAsset" ("id","workspaceId","ownerId","filename","mimeType","sizeBytes","storageKey","url","width","height") VALUES (${crypto.randomUUID()},${workspaceId},${user.id},${filename},${mimeType},${bytes.length},${storageKey},${blob.url},${width},${height})`)
      return NextResponse.json({ok:true,url:blob.url,filename,pointsCharged:charge.amount})
    } catch(error) {
      if(charge.amount>0&&!charge.idempotent) await creditPoints({userId:user.id,amount:charge.amount,description:'Refund for failed image render',reference:`services:image-render:${idempotencyKey}:rollback`,workspace:workspaceId}).catch(()=>{})
      throw error
    }
  } catch(error) {
    const message=error instanceof Error?error.message:'Unable to render asset'; const status=message.includes('Insufficient points')?402:message.includes('Authentication')?401:500
    return NextResponse.json({error:message},{status})
  }
}
