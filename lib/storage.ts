import { promises as fs } from 'node:fs'
import path from 'node:path'

const BLOB_API = process.env.VERCEL_BLOB_API_URL || 'https://vercel.com/api/blob'
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv'])
const FILESYSTEM_ROOT = process.env.CLOUDIE_STORAGE_ROOT || '/tmp/cloudie-storage'

export class StorageConfigurationError extends Error {
  constructor(message = 'Private document storage is not configured') {
    super(message)
    this.name = 'StorageConfigurationError'
  }
}

export function validateUpload(mimeType: string, sizeBytes: number) {
  if (!ALLOWED_TYPES.has(mimeType)) throw new Error('Unsupported document type')
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
    throw new Error(`Document exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB upload limit`)
  }
}

export function sanitizeFilename(name: string) {
  const leaf = name.normalize('NFKC').split(/[\\/]/).pop() ?? 'document'
  const base = leaf.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 180)
  return base || 'document'
}

function useFilesystem() {
  return process.env.CLOUDIE_STORAGE_DRIVER === 'filesystem'
}

function filePath(pathname: string) {
  const normalized = pathname.replace(/\\/g, '/').replace(/^\/+/, '')
  const target = path.resolve(FILESYSTEM_ROOT, normalized)
  const root = path.resolve(/*turbopackIgnore: true*/ FILESYSTEM_ROOT)
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error('Invalid storage path')
  return target
}

function readWriteToken() {
  const value = process.env.BLOB_READ_WRITE_TOKEN?.trim()
  return value || null
}

function oidcStoreId() {
  const value = process.env.BLOB_STORE_ID?.trim()
  if (!value) return null
  return value.startsWith('store_') ? value.slice('store_'.length) : value
}

function storeIdFromReadWriteToken(value: string) {
  const [, , , storeId] = value.split('_')
  if (!storeId) throw new StorageConfigurationError('BLOB_READ_WRITE_TOKEN does not contain a valid store id')
  return storeId
}

function resolveAuth() {
  const bearer = readWriteToken()
  if (bearer) return { bearer, storeId: storeIdFromReadWriteToken(bearer) }
  const oidcToken = process.env.VERCEL_OIDC_TOKEN?.trim()
  const storeId = oidcStoreId()
  if (oidcToken && storeId) return { bearer: oidcToken, storeId }
  throw new StorageConfigurationError('Vercel Blob credentials are not configured')
}

export async function putPrivateObject(pathname: string, body: ArrayBuffer, contentType: string) {
  if (useFilesystem()) {
    const target = filePath(pathname)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, Buffer.from(body))
    return { pathname, url: `file://${target}`, contentType, etag: undefined }
  }
  const { bearer, storeId } = resolveAuth()
  const response = await fetch(`${BLOB_API}/?pathname=${encodeURIComponent(pathname)}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${bearer}`,
      'x-vercel-blob-store-id': storeId,
      'x-api-version': '12',
      'x-content-type': contentType,
      'x-content-length': String(body.byteLength),
      'x-add-random-suffix': '0',
    },
    body,
  })
  if (!response.ok) throw new Error(`Storage upload failed (${response.status})`)
  return (await response.json()) as {
    pathname: string
    url: string
    downloadUrl?: string
    etag?: string
    contentType?: string
  }
}

export async function getPrivateObject(pathname: string) {
  if (useFilesystem()) {
    try {
      const body = await fs.readFile(filePath(pathname))
      return new Response(body)
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
      if (code === 'ENOENT') throw new Error('Document not found in storage')
      throw error
    }
  }
  const { bearer, storeId } = resolveAuth()
  const response = await fetch(`https://${storeId}.private.blob.vercel-storage.com/${pathname}`, {
    headers: { authorization: `Bearer ${bearer}` },
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(response.status === 404 ? 'Document not found in storage' : `Storage read failed (${response.status})`)
  }
  return response
}

export async function storageExists(pathname: string) {
  if (useFilesystem()) {
    try {
      await fs.access(filePath(pathname))
      return true
    } catch {
      return false
    }
  }
  const { bearer, storeId } = resolveAuth()
  const response = await fetch(`https://${storeId}.private.blob.vercel-storage.com/${pathname}`, {
    method: 'HEAD',
    headers: { authorization: `Bearer ${bearer}` },
    cache: 'no-store',
  })
  if (response.status === 404) return false
  if (!response.ok) throw new Error(`Storage metadata check failed (${response.status})`)
  return true
}

export async function getPrivateObjectMetadata(pathname: string) {
  if (useFilesystem()) {
    const target = filePath(pathname)
    const stat = await fs.stat(/*turbopackIgnore: true*/ target)
    return { contentType: undefined, contentLength: String(stat.size), etag: undefined }
  }
  const { bearer, storeId } = resolveAuth()
  const response = await fetch(`https://${storeId}.private.blob.vercel-storage.com/${pathname}`, {
    method: 'HEAD',
    headers: { authorization: `Bearer ${bearer}` },
    cache: 'no-store',
  })
  if (response.status === 404) throw new Error('Document not found in storage')
  if (!response.ok) throw new Error(`Storage metadata read failed (${response.status})`)
  return {
    contentType: response.headers.get('content-type'),
    contentLength: response.headers.get('content-length'),
    etag: response.headers.get('etag'),
  }
}

export async function deletePrivateObject(url: string) {
  if (useFilesystem()) {
    if (url.startsWith('file://')) await fs.rm(new URL(url), { force: true })
    else await fs.rm(filePath(url), { force: true })
    return
  }
  const { bearer } = resolveAuth()
  const response = await fetch(`${BLOB_API}/delete`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json', 'x-api-version': '12' },
    body: JSON.stringify({ urls: [url] }),
  })
  if (!response.ok) throw new Error(`Storage deletion failed (${response.status})`)
}
