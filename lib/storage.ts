const BLOB_API = process.env.VERCEL_BLOB_API_URL || 'https://vercel.com/api/blob'
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/csv',
])

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
  const base = name.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180)
  return base || 'document'
}

function token() {
  const value = process.env.BLOB_READ_WRITE_TOKEN?.trim()
  if (!value) throw new StorageConfigurationError('Set BLOB_READ_WRITE_TOKEN to enable private document storage')
  return value
}

function storeIdFromToken(value: string) {
  const [, , , storeId] = value.split('_')
  if (!storeId) throw new StorageConfigurationError('BLOB_READ_WRITE_TOKEN does not contain a valid store id')
  return storeId
}

export async function putPrivateObject(pathname: string, body: ArrayBuffer, contentType: string) {
  const bearer = token()
  const response = await fetch(`${BLOB_API}/?pathname=${encodeURIComponent(pathname)}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${bearer}`,
      'x-vercel-blob-store-id': storeIdFromToken(bearer),
      'x-api-version': '12',
      'x-content-type': contentType,
      'x-content-length': String(body.byteLength),
      'x-add-random-suffix': '0',
    },
    body,
  })
  if (!response.ok) throw new Error(`Storage upload failed (${response.status})`)
  return (await response.json()) as { pathname: string; url: string; downloadUrl?: string; etag?: string; contentType?: string }
}

export async function getPrivateObject(pathname: string) {
  const bearer = token()
  const storeId = storeIdFromToken(bearer)
  const response = await fetch(`https://${storeId}.private.blob.vercel-storage.com/${pathname}`, {
    headers: { authorization: `Bearer ${bearer}` },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(response.status === 404 ? 'Document not found in storage' : `Storage read failed (${response.status})`)
  return response
}

export async function deletePrivateObject(url: string) {
  const bearer = token()
  const response = await fetch(`${BLOB_API}/delete`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json', 'x-api-version': '12' },
    body: JSON.stringify({ urls: [url] }),
  })
  if (!response.ok) throw new Error(`Storage deletion failed (${response.status})`)
}
