import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/authorization'
import { putPrivateObject, sanitizeFilename, validateUpload } from '@/lib/storage'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const ALLOWED_KYC_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const MAX_KYC_BYTES = 4 * 1024 * 1024

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const form = await request.formData()
    const file = form.get('file')
    const documentType = String(form.get('documentType') || '').trim()

    if (!(file instanceof File) || !documentType) return NextResponse.json({ error: 'file and documentType are required' }, { status: 400 })
    if (!ALLOWED_KYC_TYPES.has(file.type)) return NextResponse.json({ error: 'KYC documents must be PDF, JPEG, PNG, or WebP' }, { status: 400 })
    if (file.size <= 0 || file.size > MAX_KYC_BYTES) return NextResponse.json({ error: 'KYC document exceeds the 4 MB upload limit' }, { status: 400 })

    validateUpload(file.type, file.size)
    const safeName = sanitizeFilename(file.name)
    const storageKey = `kyc/${user.id}/${crypto.randomUUID()}-${safeName}`
    await putPrivateObject(storageKey, await file.arrayBuffer(), file.type)

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        userId: user.id,
        action: 'kyc.document_uploaded',
        entity: 'KYCSubmission',
        entityId: storageKey,
        metadata: { documentType, originalFilename: safeName, mimeType: file.type, sizeBytes: file.size },
      },
    })

    return NextResponse.json({ storageKey, originalFilename: safeName, mimeType: file.type, sizeBytes: file.size }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to upload KYC document'
    const status = message.includes('Authentication') ? 401 : message.includes('configured') ? 503 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
