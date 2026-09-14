import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const allowed = new Set([
  'https://cloudie-five.vercel.app',
  ...(process.env.NEXT_PUBLIC_APP_URL ? [process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')] : []),
])

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin && !allowed.has(origin.replace(/\/$/, ''))) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 })
  }
  const response = NextResponse.next()
  response.headers.set('X-Request-Id', crypto.randomUUID())
  return response
}

export const config = { matcher: ['/api/:path*'] }
