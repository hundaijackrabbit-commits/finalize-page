import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../../lib/supabase/admin';
import { enqueueJob, JOBS } from '../../../../lib/processing/queue';

function authorized(request) {
  const expected = process.env.FINALIZE_WORKER_SECRET;
  const supplied = request.headers.get('x-finalize-worker-secret');
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected); const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.json();
  const artifactId = String(body.artifactId || '');
  const result = String(body.result || '').toUpperCase();
  if (!artifactId || !['CLEAN','INFECTED','FAILED'].includes(result)) return NextResponse.json({ error: 'invalid_security_event' }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { data: artifact, error } = await db.from('artifacts').select('*').eq('id', artifactId).single();
  if (error || !artifact) return NextResponse.json({ error: 'artifact_not_found' }, { status: 404 });
  const now = new Date().toISOString();
  if (result === 'INFECTED') {
    await db.from('artifacts').update({ status: 'INFECTED', malware_scan_status: 'INFECTED', safe_for_ai: false, processing_error: 'Malware provider reported a threat', updated_at: now }).eq('id', artifact.id);
    await db.from('processing_jobs').update({ status: 'CANCELLED', completed_at: now, updated_at: now }).eq('artifact_id', artifact.id).in('status', ['QUEUED','RETRY','WAITING_EXTERNAL']);
  } else if (result === 'FAILED') {
    await db.from('artifacts').update({ malware_scan_status: 'FAILED', processing_error: String(body.detail || 'Malware scan failed'), updated_at: now }).eq('id', artifact.id);
    await db.from('processing_jobs').update({ status: 'RETRY', available_at: new Date(Date.now() + 60_000).toISOString(), last_error: String(body.detail || 'Malware provider failure'), updated_at: now }).eq('artifact_id', artifact.id).eq('job_type', JOBS.MALWARE_SCAN);
  } else {
    await db.from('artifacts').update({ malware_scan_status: 'CLEAN', processing_error: null, updated_at: now }).eq('id', artifact.id);
    await db.from('processing_jobs').update({ status: 'SUCCEEDED', output: { provider: body.provider || 'guardduty', result: 'CLEAN' }, completed_at: now, updated_at: now }).eq('artifact_id', artifact.id).eq('job_type', JOBS.MALWARE_SCAN);
    await enqueueJob(db, artifact, JOBS.PARSE_DOCUMENT, {}, 50);
  }
  await db.from('artifact_processing_events').insert({ organization_id: artifact.organization_id, finalization_id: artifact.finalization_id, artifact_id: artifact.id, stage: 'malware', state: result, detail: { provider: body.provider || 'guardduty', eventId: body.eventId || null } });
  await db.from('audit_events').insert({ organization_id: artifact.organization_id, finalization_id: artifact.finalization_id, event_type: result === 'CLEAN' ? 'artifact.malware_clean' : result === 'INFECTED' ? 'artifact.infected' : 'artifact.malware_failed', event_data: { text: result === 'CLEAN' ? `Security scan cleared ${artifact.original_filename}` : result === 'INFECTED' ? `Security scan quarantined ${artifact.original_filename} after detecting a threat` : `Security scan failed for ${artifact.original_filename}`, actor: 'Finalize security', artifactId: artifact.id, provider: body.provider || 'guardduty' } });
  return NextResponse.json({ ok: true, artifactId, result });
}
