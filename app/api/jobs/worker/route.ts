import { NextResponse } from 'next/server'
import { processDueJobs } from '@/lib/jobs'

function authorized(request: Request) {
  const secret = process.env.JOBS_RUNNER_SECRET ?? process.env.CRON_SECRET
  const authorization = request.headers.get('authorization')
  const supplied = request.headers.get('x-jobs-runner-secret')
  return Boolean(secret && ((authorization === `Bearer ${secret}`) || supplied === secret))
}

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await processDueJobs(10)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('job worker failed', error)
    return NextResponse.json({ ok: false, error: 'Job runner unavailable' }, { status: 500 })
  }
}

export async function POST(request: Request) { return run(request) }
export async function GET(request: Request) { return run(request) }
