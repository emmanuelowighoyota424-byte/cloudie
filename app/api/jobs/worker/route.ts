import { NextResponse } from 'next/server'
import { processDueJobs } from '@/lib/jobs'

export async function POST(request: Request) {
  const configured = process.env.JOBS_RUNNER_SECRET
  const supplied = request.headers.get('x-jobs-runner-secret')
  if (!configured || !supplied || supplied !== configured) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await processDueJobs(10)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('job worker failed', error)
    return NextResponse.json({ ok: false, error: 'Job runner unavailable' }, { status: 500 })
  }
}
