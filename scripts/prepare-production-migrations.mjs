import { execFileSync } from 'node:child_process'
import pg from 'pg'

const { Client } = pg

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for production migration preparation')
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    const result = await client.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations') AS present`)
    if (result.rows[0]?.present) {
      console.log('Prisma migration history already exists; skipping baseline resolution.')
      return
    }
  } finally {
    await client.end()
  }

  console.log('No Prisma migration history found. Verifying the existing production schema matches Prisma before baselining.')
  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'diff', '--from-url', process.env.DATABASE_URL, '--to-schema', 'prisma/schema.prisma', '--exit-code'], { stdio: 'inherit', env: process.env })
  } catch (error) {
    const code = typeof error?.status === 'number' ? error.status : 1
    if (code === 2) throw new Error('Production database schema differs from prisma/schema.prisma; refusing to baseline automatically.')
    throw error
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'resolve', '--applied', '0_init'], { stdio: 'inherit', env: process.env })
  console.log('Production database successfully baselined as 0_init without modifying existing data.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
