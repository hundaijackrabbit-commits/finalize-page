import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../../../lib/supabase/admin';
import { deleteArtifactObjects } from '../../../../../lib/processing/retention';

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
  const limit = Math.max(1, Math.min(Number(body.limit || 10), 50));
  const db = createSupabaseAdminClient();
  const { data: artifacts, error } = await db.from('artifacts').select('*').lt('retention_delete_after', new Date().toISOString()).neq('status', 'DELETED').limit(limit);
  if (error) return NextResponse.json({ error: 'retention_lookup_failed', detail: error.message }, { status: 500 });
  const results = [];
  for (const artifact of artifacts || []) {
    try {
      const storage = await deleteArtifactObjects(artifact);
      await db.from('artifacts').update({ status: 'DELETED', storage_key: `deleted://${artifact.id}`, extracted_text_key: null, safe_for_ai: false, processing_error: null, updated_at: new Date().toISOString() }).eq('id', artifact.id);
      const completedAt = new Date().toISOString();
      await Promise.all([
        db.from('audit_events').insert({ organization_id: artifact.organization_id, finalization_id: artifact.finalization_id, event_type: 'artifact.retention_deleted', event_data: { text: `Retention policy deleted source/derived content for ${artifact.original_filename}`, actor: 'Finalize retention', artifactId: artifact.id, deletedObjects: storage.deleted } }),
        db.from('privacy_disposal_requests').update({ status: 'completed', completed_at: completedAt }).eq('artifact_id', artifact.id).eq('status', 'scheduled'),
        db.from('privacy_events').insert({ organization_id: artifact.organization_id, finalization_id: artifact.finalization_id, artifact_id: artifact.id, event_type: 'artifact.disposal_completed', event_data: { filename: artifact.original_filename, deletedObjects: storage.deleted } }),
      ]);
      results.push({ artifactId: artifact.id, status: 'deleted', objects: storage.deleted });
    } catch (err) {
      await db.from('privacy_disposal_requests').update({ status: 'failed', failure_detail: err.message }).eq('artifact_id', artifact.id).eq('status', 'scheduled');
      results.push({ artifactId: artifact.id, status: 'failed', error: err.message });
    }
  }
  return NextResponse.json({ processed: results.length, results });
}
