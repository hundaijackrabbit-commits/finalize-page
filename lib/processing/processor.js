import crypto from 'node:crypto';
import { extensionFor, validateFileSignature } from './signatures';
import { inspectZip } from './archive';
import { getObjectBuffer, getObjectStream, putDerivedObject } from './storage';
import { parseArtifact } from './parser';
import { redactPrivacy, scanPrivacy, summarizePrivacy } from './privacy';
import { enqueueJob, failJob, JOBS, processingEvent, succeedJob, waitExternal } from './queue';

const ZIP_EXTENSIONS = new Set(['zip','docx','xlsx','pptx']);

async function getArtifact(db, id) {
  const { data, error } = await db.from('artifacts').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

async function updateArtifact(db, id, patch) {
  const { error } = await db.from('artifacts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

async function audit(db, artifact, eventType, text, data = {}) {
  await db.from('audit_events').insert({ organization_id: artifact.organization_id, finalization_id: artifact.finalization_id, event_type: eventType, event_data: { text, actor: 'Finalize processing', artifactId: artifact.id, ...data } });
}

async function hashStream(body) {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  for await (const chunk of body) { const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); hash.update(b); bytes += b.length; }
  return { sha256: hash.digest('hex'), bytes };
}

async function runSignature(db, job, artifact) {
  const header = await getObjectBuffer(artifact.storage_key, { range: 'bytes=0-8191', maxBytes: 16 * 1024 });
  const result = validateFileSignature(artifact.original_filename, artifact.mime_type, header);
  if (!result.ok) {
    await updateArtifact(db, artifact.id, { status: 'REJECTED', signature_status: 'FAILED', processing_error: `File signature validation failed: ${result.reason}`, safe_for_ai: false });
    await audit(db, artifact, 'artifact.rejected', `Rejected ${artifact.original_filename}: file signature did not match the allowed type.`, result);
    await processingEvent(db, job, 'signature', 'REJECTED', result);
    await succeedJob(db, job, result);
    return { terminal: true };
  }
  await updateArtifact(db, artifact.id, { status: 'SCANNING', signature_status: 'PASSED', detected_mime_type: result.detectedMime, processing_error: null });
  await processingEvent(db, job, 'signature', 'PASSED', result);
  await succeedJob(db, job, result);
  await enqueueJob(db, artifact, JOBS.HASH_SOURCE, {}, 20);
}

async function runHash(db, job, artifact) {
  const object = await getObjectStream(artifact.storage_key);
  const result = await hashStream(object.Body);
  if (Number(result.bytes) !== Number(artifact.size_bytes)) throw new Error(`Source hash read ${result.bytes} bytes but expected ${artifact.size_bytes}`);
  await updateArtifact(db, artifact.id, { source_sha256: result.sha256 });
  await processingEvent(db, job, 'integrity', 'PASSED', { bytes: result.bytes, sha256: result.sha256 });
  await succeedJob(db, job, { bytes: result.bytes, sha256: result.sha256 });
  await enqueueJob(db, artifact, JOBS.ARCHIVE_SAFETY, {}, 30);
}

async function runArchive(db, job, artifact) {
  const ext = extensionFor(artifact.original_filename);
  if (!ZIP_EXTENSIONS.has(ext)) {
    await updateArtifact(db, artifact.id, { archive_scan_status: 'NOT_APPLICABLE' });
    await processingEvent(db, job, 'archive', 'NOT_APPLICABLE');
    await succeedJob(db, job, { applicable: false });
  } else {
    try {
      const result = await inspectZip(artifact.storage_key, artifact.size_bytes);
      await updateArtifact(db, artifact.id, { archive_scan_status: 'PASSED' });
      await processingEvent(db, job, 'archive', 'PASSED', result);
      await succeedJob(db, job, result);
    } catch (error) {
      await updateArtifact(db, artifact.id, { status: 'REJECTED', archive_scan_status: 'FAILED', processing_error: `Archive safety rejection: ${error.message}`, safe_for_ai: false });
      await processingEvent(db, job, 'archive', 'REJECTED', { error: error.message });
      await audit(db, artifact, 'artifact.rejected', `Rejected ${artifact.original_filename}: unsafe archive structure.`, { error: error.message });
      await succeedJob(db, job, { rejected: true, reason: error.message });
      return { terminal: true };
    }
  }
  await enqueueJob(db, artifact, JOBS.MALWARE_SCAN, {}, 40);
}

async function runMalware(db, job, artifact) {
  const mode = process.env.FINALIZE_MALWARE_MODE || 'guardduty';
  if (mode === 'trusted_dev') {
    if (process.env.NODE_ENV === 'production') throw new Error('trusted_dev malware mode is refused in production');
    await updateArtifact(db, artifact.id, { malware_scan_status: 'CLEAN' });
    await processingEvent(db, job, 'malware', 'CLEAN', { provider: 'trusted_dev' });
    await succeedJob(db, job, { provider: 'trusted_dev', result: 'CLEAN' });
    await enqueueJob(db, artifact, JOBS.PARSE_DOCUMENT, {}, 50);
    return;
  }
  if (mode !== 'guardduty') throw new Error(`Unsupported FINALIZE_MALWARE_MODE: ${mode}`);
  await updateArtifact(db, artifact.id, { malware_scan_status: 'AWAITING_PROVIDER', status: 'SCANNING' });
  await processingEvent(db, job, 'malware', 'WAITING_EXTERNAL', { provider: 'guardduty' });
  await waitExternal(db, job, { provider: 'guardduty', storageKey: artifact.storage_key });
}

async function runParser(db, job, artifact) {
  if (artifact.malware_scan_status !== 'CLEAN') throw new Error('Parser refused: malware scan is not CLEAN');
  const result = await parseArtifact(artifact);
  await updateArtifact(db, artifact.id, { status: 'PROCESSING', parser_status: result.status, extracted_text_key: result.key || null, derived_prefix: `${artifact.organization_id}/${artifact.finalization_id}/${artifact.id}/derived/` });
  await processingEvent(db, job, 'parser', result.status, { parser: result.parser, reason: result.reason, extractedTextKey: result.key || null });
  await succeedJob(db, job, { status: result.status, parser: result.parser, reason: result.reason, extractedTextKey: result.key || null });
  await enqueueJob(db, artifact, JOBS.PRIVACY_SCAN, { extractedTextKey: result.key || null }, 60);
}

async function runPrivacy(db, job, artifact) {
  if (!artifact.extracted_text_key) {
    await updateArtifact(db, artifact.id, { privacy_scan_status: 'LIMITED', pii_summary: {} });
    await processingEvent(db, job, 'privacy', 'LIMITED', { reason: 'no_text_derivative' });
    await succeedJob(db, job, { status: 'LIMITED', findings: [] });
    await enqueueJob(db, artifact, JOBS.REDACT_DERIVED, {}, 70);
    return;
  }
  const text = (await getObjectBuffer(artifact.extracted_text_key, { maxBytes: Number(process.env.FINALIZE_PRIVACY_TEXT_MAX_BYTES || 25 * 1024 * 1024) })).toString('utf8');
  const findings = scanPrivacy(text);
  await db.from('artifact_privacy_findings').delete().eq('artifact_id', artifact.id);
  if (findings.length) {
    const rows = findings.map((f) => ({ organization_id: artifact.organization_id, finalization_id: artifact.finalization_id, artifact_id: artifact.id, category: f.category, label: f.label, count: f.count, sensitivity: f.sensitivity, evidence: { offsets: f.offsets } }));
    const { error } = await db.from('artifact_privacy_findings').insert(rows);
    if (error) throw error;
  }
  const summary = summarizePrivacy(findings);
  await updateArtifact(db, artifact.id, { privacy_scan_status: 'COMPLETE', pii_summary: summary });
  await processingEvent(db, job, 'privacy', 'COMPLETE', { summary, categories: findings.length });
  await succeedJob(db, job, { status: 'COMPLETE', summary });
  await enqueueJob(db, artifact, JOBS.REDACT_DERIVED, {}, 70);
}

async function runRedaction(db, job, artifact) {
  if (!artifact.extracted_text_key) {
    await updateArtifact(db, artifact.id, { redaction_status: 'LIMITED' });
    await processingEvent(db, job, 'redaction', 'LIMITED', { reason: 'no_text_derivative' });
    await succeedJob(db, job, { status: 'LIMITED' });
    await enqueueJob(db, artifact, JOBS.PROMOTE_READY, {}, 80);
    return;
  }
  const text = (await getObjectBuffer(artifact.extracted_text_key, { maxBytes: Number(process.env.FINALIZE_PRIVACY_TEXT_MAX_BYTES || 25 * 1024 * 1024) })).toString('utf8');
  const { data: rows, error } = await db.from('artifact_privacy_findings').select('category,label,count,sensitivity,evidence').eq('artifact_id', artifact.id);
  if (error) throw error;
  const findings = (rows || []).map((r) => ({ ...r, offsets: r.evidence?.offsets || [] }));
  const redacted = redactPrivacy(text, findings);
  const key = `${artifact.organization_id}/${artifact.finalization_id}/${artifact.id}/derived/ai-safe.txt`;
  await putDerivedObject(key, redacted, 'text/plain; charset=utf-8');
  await updateArtifact(db, artifact.id, { redaction_status: 'COMPLETE' });
  await processingEvent(db, job, 'redaction', 'COMPLETE', { aiSafeTextKey: key, replacements: findings.reduce((sum,f) => sum + Number(f.count || 0), 0) });
  await succeedJob(db, job, { status: 'COMPLETE', aiSafeTextKey: key });
  await enqueueJob(db, artifact, JOBS.PROMOTE_READY, { aiSafeTextKey: key }, 80);
}

async function runPromote(db, job, artifact) {
  const required = {
    signature: artifact.signature_status === 'PASSED',
    sourceHash: Boolean(artifact.source_sha256),
    archive: ['PASSED','NOT_APPLICABLE'].includes(artifact.archive_scan_status),
    malware: artifact.malware_scan_status === 'CLEAN',
    parser: ['COMPLETE','LIMITED'].includes(artifact.parser_status),
    privacy: ['COMPLETE','LIMITED'].includes(artifact.privacy_scan_status),
    redaction: ['COMPLETE','LIMITED'].includes(artifact.redaction_status),
  };
  const failed = Object.entries(required).filter(([,v]) => !v).map(([k]) => k);
  if (failed.length) throw new Error(`Artifact cannot be promoted; incomplete gates: ${failed.join(', ')}`);
  const safeForAi = artifact.privacy_scan_status === 'COMPLETE' && artifact.redaction_status === 'COMPLETE';
  await updateArtifact(db, artifact.id, { status: 'READY', safe_for_ai: safeForAi, security_completed_at: new Date().toISOString(), processing_completed_at: new Date().toISOString(), processing_error: null });
  await processingEvent(db, job, 'promotion', 'READY', { safeForAi });
  await audit(db, artifact, 'artifact.ready', `${artifact.original_filename} passed the trust-processing gate.`, { safeForAi, privacyScanStatus: artifact.privacy_scan_status });
  await succeedJob(db, job, { status: 'READY', safeForAi });
}

const HANDLERS = {
  [JOBS.VALIDATE_SIGNATURE]: runSignature,
  [JOBS.HASH_SOURCE]: runHash,
  [JOBS.ARCHIVE_SAFETY]: runArchive,
  [JOBS.MALWARE_SCAN]: runMalware,
  [JOBS.PARSE_DOCUMENT]: runParser,
  [JOBS.PRIVACY_SCAN]: runPrivacy,
  [JOBS.REDACT_DERIVED]: runRedaction,
  [JOBS.PROMOTE_READY]: runPromote,
};

export async function processClaimedJob(db, job) {
  const handler = HANDLERS[job.job_type];
  if (!handler) throw new Error(`Unknown processing job: ${job.job_type}`);
  const artifact = await getArtifact(db, job.artifact_id);
  if (['REJECTED','INFECTED','DELETED'].includes(artifact.status)) {
    await processingEvent(db, job, job.job_type.toLowerCase(), 'CANCELLED', { artifactStatus: artifact.status });
    await db.from('processing_jobs').update({ status: 'CANCELLED', lease_until: null, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', job.id);
    return { status: 'cancelled' };
  }
  try {
    await handler(db, job, artifact);
    return { status: 'ok' };
  } catch (error) {
    const terminal = await failJob(db, job, error);
    await processingEvent(db, job, job.job_type.toLowerCase(), terminal ? 'DEAD_LETTER' : 'RETRY', { error: error.message });
    if (terminal) {
      await updateArtifact(db, artifact.id, { status: 'FAILED', processing_error: error.message, safe_for_ai: false });
      await audit(db, artifact, 'artifact.processing_failed', `Processing failed for ${artifact.original_filename}.`, { jobType: job.job_type, error: error.message });
    }
    return { status: terminal ? 'dead_letter' : 'retry', error: error.message };
  }
}
