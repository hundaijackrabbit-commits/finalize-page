import { createSupabaseAdminClient } from '../supabase/admin';

export const JOBS = {
  VALIDATE_SIGNATURE: 'VALIDATE_SIGNATURE',
  HASH_SOURCE: 'HASH_SOURCE',
  ARCHIVE_SAFETY: 'ARCHIVE_SAFETY',
  MALWARE_SCAN: 'MALWARE_SCAN',
  PARSE_DOCUMENT: 'PARSE_DOCUMENT',
  PRIVACY_SCAN: 'PRIVACY_SCAN',
  REDACT_DERIVED: 'REDACT_DERIVED',
  PROMOTE_READY: 'PROMOTE_READY',
};

export async function enqueueJob(db, artifact, jobType, input = {}, priority = 100) {
  const row = { organization_id: artifact.organization_id, finalization_id: artifact.finalization_id, artifact_id: artifact.id, job_type: jobType, status: 'QUEUED', input, priority, available_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { error } = await db.from('processing_jobs').upsert(row, { onConflict: 'artifact_id,job_type', ignoreDuplicates: true });
  if (error) throw error;
}

export async function seedArtifactPipeline(db, artifact) {
  await enqueueJob(db, artifact, JOBS.VALIDATE_SIGNATURE, {}, 10);
}

export async function claimJob(workerId) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.rpc('claim_finalize_processing_job', { p_worker_id: workerId, p_lease_seconds: 180 });
  if (error) throw error;
  return { db, job: data?.[0] || null };
}

export async function processingEvent(db, job, stage, state, detail = {}) {
  await db.from('artifact_processing_events').insert({ organization_id: job.organization_id, finalization_id: job.finalization_id, artifact_id: job.artifact_id, job_id: job.id, stage, state, detail });
}

export async function succeedJob(db, job, output = {}) {
  const { error } = await db.from('processing_jobs').update({ status: 'SUCCEEDED', output, completed_at: new Date().toISOString(), lease_until: null, updated_at: new Date().toISOString() }).eq('id', job.id).eq('worker_id', job.worker_id);
  if (error) throw error;
}

export async function waitExternal(db, job, output = {}) {
  const { error } = await db.from('processing_jobs').update({ status: 'WAITING_EXTERNAL', output, lease_until: null, updated_at: new Date().toISOString() }).eq('id', job.id).eq('worker_id', job.worker_id);
  if (error) throw error;
}

export async function failJob(db, job, error) {
  const attempts = Number(job.attempts || 1);
  const maxAttempts = Number(job.max_attempts || 4);
  const terminal = attempts >= maxAttempts;
  const delaySeconds = Math.min(15 * 60, Math.pow(2, attempts) * 15);
  const patch = terminal
    ? { status: 'DEAD_LETTER', dead_lettered_at: new Date().toISOString() }
    : { status: 'RETRY', available_at: new Date(Date.now() + delaySeconds * 1000).toISOString() };
  const { error: updateError } = await db.from('processing_jobs').update({ ...patch, last_error: String(error?.message || error).slice(0,4000), lease_until: null, updated_at: new Date().toISOString() }).eq('id', job.id).eq('worker_id', job.worker_id);
  if (updateError) throw updateError;
  return terminal;
}
