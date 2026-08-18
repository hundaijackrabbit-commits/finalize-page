import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3, uploadBucket } from '../../../../lib/uploads/s3';
import { getFinalization, requireAuthContext, writeAudit } from '../../../../lib/repository/finalizations';
import { s3Configured } from '../../../../lib/runtime';
import { seedArtifactPipeline } from '../../../../lib/processing/queue';
import { calculateRetentionDate, loadPrivacySettings } from '../../../../lib/privacy/policy';

const PART_SIZE = 8 * 1024 * 1024;
const MAX_SIZE = 5 * 1024 * 1024 * 1024;
const ALLOWED = new Map([
  ['pdf','application/pdf'], ['docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], ['pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['txt','text/plain'], ['md','text/markdown'], ['png','image/png'], ['jpg','image/jpeg'], ['jpeg','image/jpeg'], ['webp','image/webp'], ['zip','application/zip'],
]);

function safeName(name) {
  return name.normalize('NFKC').replace(/[\\/\0]/g, '-').replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim().slice(0,180) || 'upload.bin';
}
function extension(name) { return name.split('.').pop()?.toLowerCase() || ''; }
async function getSession(ctx, artifactId) {
  const { data, error } = await ctx.db.from('upload_sessions').select('*,artifacts(*)').eq('artifact_id', artifactId).eq('organization_id', ctx.organization.id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function POST(request) {
  const ctx = await requireAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!s3Configured()) return NextResponse.json({ error: 'storage_not_configured' }, { status: 503 });
  try {
    const body = await request.json();
    const action = body.action;
    const s3 = getS3();
    const Bucket = uploadBucket();

    if (action === 'start') {
      const finalization = await getFinalization(ctx, body.finalizationId);
      if (!finalization) return NextResponse.json({ error: 'finalization_not_found' }, { status: 404 });
      const filename = safeName(String(body.filename || ''));
      const ext = extension(filename);
      const expectedMime = ALLOWED.get(ext);
      const size = Number(body.size || 0);
      if (!expectedMime) return NextResponse.json({ error: 'file_type_not_allowed', allowed: [...ALLOWED.keys()] }, { status: 415 });
      if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_SIZE) return NextResponse.json({ error: 'invalid_file_size', maxBytes: MAX_SIZE }, { status: 413 });
      const suppliedMime = String(body.contentType || '').toLowerCase();
      if (suppliedMime && suppliedMime !== expectedMime && !(ext === 'md' && suppliedMime === 'text/plain') && !(ext === 'zip' && ['application/x-zip-compressed','application/octet-stream'].includes(suppliedMime))) return NextResponse.json({ error: 'mime_type_mismatch' }, { status: 415 });

      const privacySettings = await loadPrivacySettings(ctx.db, ctx.organization.id);
      const artifactId = crypto.randomUUID();
      const retentionDeleteAfter = calculateRetentionDate(privacySettings.sourceRetentionDays);
      const Key = `${ctx.organization.id}/${finalization.id}/${artifactId}/${crypto.randomUUID()}-${filename}`;
      const created = await s3.send(new CreateMultipartUploadCommand({ Bucket, Key, ContentType: expectedMime, ServerSideEncryption: 'AES256', ChecksumAlgorithm: 'SHA256', Metadata: { 'artifact-id': artifactId, 'finalization-id': finalization.id } }));
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error: artifactError } = await ctx.db.from('artifacts').insert({ id: artifactId, organization_id: ctx.organization.id, finalization_id: finalization.id, original_filename: filename, storage_key: Key, size_bytes: size, mime_type: expectedMime, status: 'UPLOADING', privacy_classification: ['PUBLIC','BUSINESS','CONFIDENTIAL','RESTRICTED'].includes(body.privacy) ? body.privacy : 'BUSINESS', retention_delete_after: retentionDeleteAfter, created_by: ctx.user.id });
      if (artifactError) { await s3.send(new AbortMultipartUploadCommand({ Bucket, Key, UploadId: created.UploadId })).catch(() => {}); throw artifactError; }
      const { error: sessionError } = await ctx.db.from('upload_sessions').insert({ organization_id: ctx.organization.id, finalization_id: finalization.id, artifact_id: artifactId, provider_upload_id: created.UploadId, part_size_bytes: PART_SIZE, status: 'UPLOADING', expires_at: expiresAt, created_by: ctx.user.id });
      if (sessionError) throw sessionError;
      await writeAudit(ctx, finalization.id, 'artifact.upload_started', `Upload started: ${filename}`, { artifactId, size });
      return NextResponse.json({ artifactId, partSize: PART_SIZE, expiresAt });
    }

    const artifactId = String(body.artifactId || '');
    const session = await getSession(ctx, artifactId);
    if (!session || session.status === 'ABORTED' || new Date(session.expires_at) <= new Date()) return NextResponse.json({ error: 'upload_session_unavailable' }, { status: 410 });
    const Key = session.artifacts.storage_key;
    const UploadId = session.provider_upload_id;

    if (action === 'sign_part') {
      const partNumber = Number(body.partNumber);
      const checksum = String(body.checksum || '');
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000 || !checksum) return NextResponse.json({ error: 'invalid_part' }, { status: 400 });
      const command = new UploadPartCommand({ Bucket, Key, UploadId, PartNumber: partNumber, ChecksumSHA256: checksum });
      const url = await getSignedUrl(s3, command, { expiresIn: 15 * 60 });
      return NextResponse.json({ url, partNumber });
    }

    if (action === 'complete') {
      const parts = Array.isArray(body.parts) ? body.parts : [];
      if (!parts.length) return NextResponse.json({ error: 'parts_required' }, { status: 400 });
      await ctx.db.from('upload_sessions').update({ status: 'COMPLETING', updated_at: new Date().toISOString() }).eq('artifact_id', artifactId);
      const completed = await s3.send(new CompleteMultipartUploadCommand({ Bucket, Key, UploadId, MultipartUpload: { Parts: parts.map((p) => ({ ETag: p.etag, PartNumber: Number(p.partNumber), ChecksumSHA256: p.checksum })) } }));
      const head = await s3.send(new HeadObjectCommand({ Bucket, Key, ChecksumMode: 'ENABLED' }));
      if (Number(head.ContentLength) !== Number(session.artifacts.size_bytes)) {
        await ctx.db.from('artifacts').update({ status: 'REJECTED', processing_error: 'Uploaded object length did not match the declared file size', updated_at: new Date().toISOString() }).eq('id', artifactId);
        throw new Error('Object size integrity check failed');
      }
      const integrity = completed.ChecksumSHA256 || head.ChecksumSHA256 || null;
      await ctx.db.from('artifacts').update({ status: 'QUARANTINED', integrity_checksum: integrity, malware_scan_status: 'PENDING', updated_at: new Date().toISOString() }).eq('id', artifactId);
      await ctx.db.from('upload_sessions').update({ status: 'COMPLETE', updated_at: new Date().toISOString() }).eq('artifact_id', artifactId);
      await seedArtifactPipeline(ctx.db, { ...session.artifacts, status: 'QUARANTINED' });
      const { data: nextVersion, error: versionError } = await ctx.db.rpc('bump_finalize_artifact_version', { p_finalization_id: session.finalization_id, p_organization_id: ctx.organization.id });
      if (versionError) throw versionError;
      await ctx.db.from('finalization_versions').upsert({ finalization_id: session.finalization_id, version_number: nextVersion, artifact_id: artifactId, reason: 'artifact_uploaded', created_by: ctx.user.id }, { onConflict: 'finalization_id,version_number' });
      await writeAudit(ctx, session.finalization_id, 'artifact.uploaded', `Upload complete and quarantined: ${session.artifacts.original_filename}`, { artifactId, artifactVersion: nextVersion });
      await writeAudit(ctx, session.finalization_id, 'approval.superseded', `Artifact changed to version ${nextVersion}; prior approval no longer applies`, { artifactVersion: nextVersion });
      return NextResponse.json({ artifactId, status: 'QUARANTINED', integrityChecksum: integrity, artifactVersion: nextVersion, approvalInvalidated: true });
    }

    if (action === 'abort') {
      await s3.send(new AbortMultipartUploadCommand({ Bucket, Key, UploadId })).catch(() => {});
      await ctx.db.from('upload_sessions').update({ status: 'ABORTED', updated_at: new Date().toISOString() }).eq('artifact_id', artifactId);
      await ctx.db.from('artifacts').update({ status: 'FAILED', processing_error: 'Upload aborted by user', updated_at: new Date().toISOString() }).eq('id', artifactId);
      await writeAudit(ctx, session.finalization_id, 'artifact.upload_aborted', `Upload aborted: ${session.artifacts.original_filename}`, { artifactId });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'upload_action_failed', detail: error.message }, { status: 500 });
  }
}
