import { Pool } from 'pg'

function normalizeDatabaseUrl(value: string | undefined) {
  if (!value) return value
  try {
    const url = new URL(value)
    const sslmode = url.searchParams.get('sslmode')
    if (sslmode === 'prefer' || sslmode === 'require' || sslmode === 'verify-ca') url.searchParams.set('sslmode', 'verify-full')
    return url.toString()
  } catch {
    return value
  }
}

export const pool = new Pool({ connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL) })
