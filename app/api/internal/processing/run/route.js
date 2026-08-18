import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { claimJob } from '../../../../../lib/processing/queue';
import { processClaimedJob } from '../../../../../lib/processing/processor';

function authorized(request) {
  const expected = process.env.FINALIZE_WORKER_SECRET;
  const supplied = request.headers.get('x-finalize-worker-secret');
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected); const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const maxJobs = Math.max(1, Math.min(Number(body.maxJobs || 5), 25));
  const workerId = String(body.workerId || `api-${crypto.randomUUID()}`).slice(0,120);
  const results = [];
  for (let i = 0; i < maxJobs; i++) {
    const { db, job } = await claimJob(workerId);
    if (!job) break;
    const result = await processClaimedJob(db, job);
    results.push({ jobId: job.id, artifactId: job.artifact_id, type: job.job_type, ...result });
    if (result.status === 'retry') break;
  }
  return NextResponse.json({ workerId, processed: results.length, results });
}
