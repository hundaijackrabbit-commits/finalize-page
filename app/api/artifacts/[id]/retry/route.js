import { NextResponse } from 'next/server';
import { requireAuthContext } from '../../../../../lib/repository/finalizations';
import { enqueueJob, JOBS } from '../../../../../lib/processing/queue';

export async function POST(request, { params }) {
  const ctx = await requireAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const { data: artifact, error } = await ctx.db.from('artifacts').select('*').eq('id', id).eq('organization_id', ctx.organization.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'artifact_lookup_failed', detail: error.message }, { status: 500 });
  if (!artifact) return NextResponse.json({ error: 'artifact_not_found' }, { status: 404 });
  if (artifact.status === 'INFECTED') return NextResponse.json({ error: 'infected_artifact_cannot_retry' }, { status: 409 });
  await ctx.db.from('processing_jobs').delete().eq('artifact_id', artifact.id);
  await ctx.db.from('artifact_privacy_findings').delete().eq('artifact_id', artifact.id);
  await ctx.db.from('artifacts').update({ status: 'QUARANTINED', signature_status: 'PENDING', archive_scan_status: 'NOT_APPLICABLE', malware_scan_status: 'PENDING', privacy_scan_status: 'PENDING', parser_status: 'PENDING', redaction_status: 'PENDING', safe_for_ai: false, processing_error: null, updated_at: new Date().toISOString() }).eq('id', artifact.id);
  await enqueueJob(ctx.db, artifact, JOBS.VALIDATE_SIGNATURE, {}, 10);
  return NextResponse.json({ ok: true, artifactId: artifact.id, status: 'QUARANTINED' });
}
