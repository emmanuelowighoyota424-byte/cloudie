import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'

const { Client } = pg
const RECONCILIATION_SQL = '/tmp/cloudie-production-forward.sql'
const LEGACY_TABLES = new Set([
  '_hub_migrations',
  'account',
  'phone_links',
  'session',
  'slack_link_codes',
  'slack_links',
  'threads',
  'user',
  'user_profiles',
  'verification',
])

function runPrisma(args, env = process.env) {
  return execFileSync('pnpm', ['exec', 'prisma', ...args], { stdio: 'inherit', env })
}

function runPrismaCapture(args, env = process.env) {
  return execFileSync('pnpm', ['exec', 'prisma', ...args], { encoding: 'utf8', env })
}

function isLegacyTable(name) {
  return LEGACY_TABLES.has(name)
}

function filterPreservedLegacyOperations(sql) {
  const lines = sql.split(/\r?\n/)
  const kept = []
  let skipping = false
  let statement = ''

  const flush = () => {
    const candidate = statement.trim()
    statement = ''
    if (!candidate) return

    const dropTable = candidate.match(/^DROP TABLE(?: IF EXISTS)? "([^"]+)";$/i)
    if (dropTable && isLegacyTable(dropTable[1])) return

    const dropConstraint = candidate.match(/^ALTER TABLE "([^"]+)" DROP CONSTRAINT "[^"]+";$/i)
    if (dropConstraint && isLegacyTable(dropConstraint[1])) return

    kept.push(candidate)
  }

  for (const line of lines) {
    if (line.trim().startsWith('--')) continue
    statement += `${line}\n`
    if (line.trim().endsWith(';')) flush()
  }
  flush()
  return kept.join('\n\n')
}

function assertSafeReconciliation(sql) {
  const normalized = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const forbidden = [
    /\bTRUNCATE\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bDROP\s+TYPE\b/i,
    /\bALTER\s+TYPE[\s\S]*\bDROP\s+VALUE\b/i,
    /\bDROP\s+INDEX\b/i,
    /\bDROP\s+COLUMN\b/i,
  ]
  const matched = forbidden.find((pattern) => pattern.test(normalized))
  if (matched) {
    throw new Error(`Production schema reconciliation contains a destructive SQL operation (${matched}). Refusing automatic migration.`)
  }
}

async function main() {
  if (process.env.VERCEL !== '1') return
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for production migration preparation')

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  let migrationHistoryPresent = false
  try {
    const result = await client.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations') AS present`)
    migrationHistoryPresent = Boolean(result.rows[0]?.present)
  } finally {
    await client.end()
  }

  if (!migrationHistoryPresent) {
    console.log('No Prisma migration history found. Comparing the live production schema with prisma/schema.prisma.')
    let diffStatus = 0
    try {
      runPrisma(['migrate', 'diff', '--from-url', process.env.DATABASE_URL, '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code'])
    } catch (error) {
      diffStatus = typeof error?.status === 'number' ? error.status : 1
      if (diffStatus !== 2) throw error
    }

    if (diffStatus === 2) {
      console.log('Production schema differs from Prisma. Preserving known legacy tables while reconciling only managed Cloudie schema changes.')
      const rawSql = runPrismaCapture(['migrate', 'diff', '--from-url', process.env.DATABASE_URL, '--to-schema-datamodel', 'prisma/schema.prisma', '--script'])
      const sql = filterPreservedLegacyOperations(rawSql)
      assertSafeReconciliation(sql)
      if (sql.trim()) {
        writeFileSync(RECONCILIATION_SQL, sql, 'utf8')
        runPrisma(['db', 'execute', '--url', process.env.DATABASE_URL, '--file', RECONCILIATION_SQL])
      }

      const verifyRawSql = runPrismaCapture(['migrate', 'diff', '--from-url', process.env.DATABASE_URL, '--to-schema-datamodel', 'prisma/schema.prisma', '--script'])
      const remainingManagedDiff = filterPreservedLegacyOperations(verifyRawSql)
      if (remainingManagedDiff.trim()) {
        writeFileSync(RECONCILIATION_SQL, remainingManagedDiff, 'utf8')
        throw new Error('Production schema still differs from prisma/schema.prisma after safe reconciliation; refusing to baseline.')
      }
    }

    runPrisma(['migrate', 'resolve', '--applied', '0_init'])
    console.log('Production database baseline recorded as 0_init after live-schema verification.')
  } else {
    console.log('Prisma migration history already exists; skipping baseline resolution.')
  }

  runPrisma(['migrate', 'deploy'])
  runPrisma(['migrate', 'status'])
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
