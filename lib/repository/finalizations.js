import crypto from 'node:crypto';
import { createSupabaseServerClient } from '../supabase/server';
import { createSupabaseAdminClient } from '../supabase/admin';

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0,2).map((p) => p[0]?.toUpperCase()).join('') || '?';
}

export function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function requireAuthContext() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'unauthorized', status: 401 };
  const { data: membership, error } = await supabase
    .from('memberships')
    .select('organization_id,role,organizations(id,name,plan,brand_name,brand_accent,brand_logo_url,custom_domain)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !membership) return { error: 'workspace_missing', status: 403, user, supabase };
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'server_persistence_not_configured', status: 503, user, supabase };
  const db = createSupabaseAdminClient();
  return { supabase, db, user, membership, organization: membership.organizations };
}

export function mapFinalization(row, currentUserId) {
  const participants = (row.finalization_participants || []).map((p) => ({
    id: p.id,
    userId: p.user_id,
    name: p.display_name,
    email: p.email,
    initials: initials(p.display_name),
    role: p.role,
  }));
  const approvalRow = (row.approvals || [])[0];
  const recordRows = (row.finalization_records || []).sort((a,b) => new Date(b.finalized_at)-new Date(a.finalized_at));
  const recordRow = recordRows.find((r) => (r.record_status || 'active') === 'active') || recordRows[0];
  return {
    id: row.id,
    slug: row.id,
    title: row.title,
    type: row.type,
    client: row.counterpart_name || '—',
    dueLabel: row.due_at ? new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' }).format(new Date(row.due_at)) : 'No due date',
    state: row.state,
    artifactVersion: row.artifact_version,
    shareToken: null,
    shareExpires: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewUrl: row.review_url || null,
    templateKey: row.template_key || null,
    handoffStatus: row.handoff_status || 'NOT_STARTED',
    privacyCloseoutStatus: row.privacy_closeout_status || 'OPEN',
    participants,
    requirements: (row.requirements || []).sort((a,b) => a.position-b.position).map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      type: r.type,
      severity: r.required ? 'blocker' : 'warning',
      required: r.required,
      ownerId: r.owner_participant_id,
      status: r.status,
      evidence: r.evidence_summary,
      lastChecked: r.last_checked_at,
      dependsOnId: r.depends_on_requirement_id || null,
      evidenceDetail: r.evidence_json || {},
      resolutionAction: r.resolution_action || null,
    })),
    approval: approvalRow ? {
      id: approvalRow.id,
      title: approvalRow.title,
      status: approvalRow.status,
      reviewerId: approvalRow.reviewer_participant_id,
      requestedAt: approvalRow.requested_at,
      approvedAt: approvalRow.approved_at,
      artifactVersion: approvalRow.artifact_version,
    } : { id: null, title: 'Final approval', status: 'not_requested', reviewerId: null, requestedAt: null, approvedAt: null, artifactVersion: row.artifact_version },
    comments: (row.comments || []).sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).map((c) => ({
      id: c.id,
      authorId: c.author_participant_id,
      body: c.body,
      createdAt: c.created_at,
      requirementId: c.requirement_id,
    })),
    activity: (row.audit_events || []).sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).map((a) => ({
      id: String(a.id),
      kind: a.event_type.includes('final') ? 'finalize' : a.event_type.includes('comment') ? 'comment' : a.event_type.includes('pass') ? 'pass' : 'change',
      text: a.event_data?.text || a.event_type.replaceAll('.', ' '),
      actor: a.event_data?.actor || (a.actor_user_id === currentUserId ? 'You' : 'Finalize'),
      time: a.created_at,
    })),
    artifacts: (row.artifacts || []).sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).map((a) => ({
      id: a.id,
      name: a.original_filename,
      size: Number(a.size_bytes),
      mimeType: a.mime_type,
      status: a.status,
      privacy: a.privacy_classification,
      integrityChecksum: a.integrity_checksum,
      malwareScanStatus: a.malware_scan_status,
      signatureStatus: a.signature_status,
      archiveScanStatus: a.archive_scan_status,
      privacyScanStatus: a.privacy_scan_status,
      parserStatus: a.parser_status,
      redactionStatus: a.redaction_status,
      safeForAi: Boolean(a.safe_for_ai),
      aiBlockedReason: a.ai_blocked_reason || null,
      aiPolicyDecision: a.ai_policy_decision || {},
      privacyPolicyVersion: a.privacy_policy_version || null,
      sourceSha256: a.source_sha256,
      piiSummary: a.pii_summary || {},
      processingError: a.processing_error,
      retentionDeleteAfter: a.retention_delete_after,
      jobs: (a.processing_jobs || []).sort((x,y) => new Date(x.created_at)-new Date(y.created_at)).map((j) => ({ id: j.id, type: j.job_type, status: j.status, attempts: j.attempts, lastError: j.last_error })),
      privacyFindings: (a.artifact_privacy_findings || []).map((f) => ({ category: f.category, label: f.label, count: f.count, sensitivity: f.sensitivity })),
      documentAnalysisStatus: a.document_analysis_status || 'PENDING',
      documentType: a.document_type || a.document_type_override || null,
      documentTypeOverride: a.document_type_override || null,
      documentScore: Number.isFinite(a.document_score) ? a.document_score : null,
      documentProfile: (a.document_profiles || [])[0] ? {
        id: a.document_profiles[0].id,
        documentType: a.document_profiles[0].document_type,
        specKey: a.document_profiles[0].spec_key,
        title: a.document_profiles[0].title,
        language: a.document_profiles[0].language,
        score: a.document_profiles[0].score,
        metrics: a.document_profiles[0].metrics || {},
        structure: a.document_profiles[0].structure_json || {},
        entities: a.document_profiles[0].entities_json || {},
        analyzedAt: a.document_profiles[0].analyzed_at,
      } : null,
      documentFindings: (a.document_findings || []).sort((x,y) => new Date(y.created_at)-new Date(x.created_at)).map((f) => ({
        id:f.id, ruleKey:f.rule_key, severity:f.severity, source:f.source, title:f.title, detail:f.detail,
        evidence:f.evidence_json || {}, status:f.status, artifactVersion:f.artifact_version ?? null, resolvedAt:f.resolved_at, resolutionNote:f.resolution_note, createdAt:f.created_at,
      })),
      documentReferences: (a.document_references || []).map((r) => ({ id:r.id, type:r.reference_type, label:r.reference_label, rawText:r.raw_text, present:r.present_in_package })),
      createdAt: a.created_at,
    })),
    versions: (row.finalization_versions || []).sort((a,b) => b.version_number-a.version_number).map((v) => ({ id:v.id, versionNumber:v.version_number, artifactId:v.artifact_id, reason:v.reason, createdAt:v.created_at })),
    annotations: (row.review_annotations || []).sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).map((a) => ({ id: a.id, artifactVersion: a.artifact_version, targetType: a.target_type, targetRef: a.target_ref, x: Number(a.x_pct), y: Number(a.y_pct), body: a.body, visibility: a.visibility || 'shared', status: a.status, authorId: a.author_participant_id, createdAt: a.created_at })),
    fileRequests: (row.file_requests || []).map((r) => ({ id: r.id, title: r.title, description: r.description, acceptedExtensions: r.accepted_extensions || [], required: r.required, participantId: r.participant_id, status: r.status, artifactId: r.artifact_id, dueAt: r.due_at, completedAt: r.completed_at })),
    secureRequests: (row.secure_requests || []).map((r) => ({ id: r.id, title: r.title, requestType: r.request_type, participantId: r.participant_id, status: r.status, expiresAt: r.expires_at, submittedAt: r.submitted_at, destroyedAt: r.destroyed_at })),
    paymentGates: (row.payment_gates || []).map((g) => ({ id: g.id, label: g.label, amountCents: g.amount_cents, currency: g.currency, provider: g.provider, providerReference: g.provider_reference, paymentUrl: g.payment_url, status: g.status, paidAt: g.paid_at })),
    privacyItems: (row.privacy_closeout_items || []).map((i) => ({ id: i.id, itemType: i.item_type, title: i.title, description: i.description, required: i.required, status: i.status, dueAt: i.due_at, resolvedAt: i.resolved_at })),
    reminders: (row.reminders || []).map((r) => ({ id: r.id, participantId: r.participant_id, channel: r.channel, subject: r.subject, status: r.status, sendAt: r.send_at, sentAt: r.sent_at })),
    integrationConnections: Array.from(new Map((row.integration_bindings || []).filter((b)=>b.integration_connections).map((b)=>[b.integration_connections.id,{ id:b.integration_connections.id, provider:b.integration_connections.provider, displayName:b.integration_connections.display_name, status:b.integration_connections.status, authMode:b.integration_connections.auth_mode, config:b.integration_connections.config_json || {}, lastSyncedAt:b.integration_connections.last_synced_at, lastError:b.integration_connections.last_error }])).values()),
    integrationBindings: (row.integration_bindings || []).map((b) => ({ id:b.id, connectionId:b.connection_id, requirementId:b.requirement_id, requirementTitle:(row.requirements || []).find((r)=>r.id===b.requirement_id)?.title || null, signalKey:b.signal_key, expectedState:b.expected_state, matcher:b.matcher_json || {}, required:b.required, status:b.status, lastObservedState:b.last_observed_state, lastObservedAt:b.last_observed_at })),
    externalEvidence: (row.external_evidence || []).sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at)).map((e)=>({ id:e.id, requirementId:e.requirement_id, bindingId:e.binding_id, provider:e.provider, status:e.evidence_status, summary:e.summary, signalKey:e.evidence_json?.signalKey || null, reference:e.evidence_json?.sha || e.evidence_json?.deploymentId || e.evidence_json?.objectId || e.evidence_json?.envelopeId || e.evidence_json?.fileId || null, evidence:e.evidence_json || {}, observedAt:e.observed_at, createdAt:e.created_at })),
    record: recordRow ? {
      id: recordRow.public_record_id,
      finalizedAt: recordRow.finalized_at,
      artifactVersion: recordRow.artifact_version,
      fingerprint: recordRow.artifact_fingerprint,
      passedCount: recordRow.passed_requirement_count,
      status: recordRow.record_status || 'active',
    } : null,
    recordHistory: recordRows.map((r) => ({ id:r.public_record_id, finalizedAt:r.finalized_at, artifactVersion:r.artifact_version, fingerprint:r.artifact_fingerprint, passedCount:r.passed_requirement_count, status:r.record_status || 'active' })),
  };
}

export async function listFinalizations(ctx) {
  const { data, error } = await ctx.db
    .from('finalizations')
    .select('*,finalization_participants(*),requirements(*),comments(*),approvals(*),finalization_records(*),audit_events(*),artifacts(*,processing_jobs(*),artifact_privacy_findings(*),document_profiles(*),document_findings(*),document_references(*)),review_annotations(*),finalization_versions(*),file_requests(*),secure_requests(id,title,request_type,participant_id,status,expires_at,submitted_at,destroyed_at,created_at),payment_gates(*),privacy_closeout_items(*),reminders(*),integration_bindings(*,integration_connections(id,provider,display_name,status,auth_mode,config_json,last_synced_at,last_error)),external_evidence(id,finalization_id,requirement_id,binding_id,provider,evidence_status,summary,evidence_json,observed_at,created_at)')
    .eq('organization_id', ctx.organization.id)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data.map((row) => mapFinalization(row, ctx.user.id));
}

export async function getFinalization(ctx, id) {
  const { data, error } = await ctx.db
    .from('finalizations')
    .select('*,finalization_participants(*),requirements(*),comments(*),approvals(*),finalization_records(*),audit_events(*),artifacts(*,processing_jobs(*),artifact_privacy_findings(*),document_profiles(*),document_findings(*),document_references(*)),review_annotations(*),finalization_versions(*),file_requests(*),secure_requests(id,title,request_type,participant_id,status,expires_at,submitted_at,destroyed_at,created_at),payment_gates(*),privacy_closeout_items(*),reminders(*),integration_bindings(*,integration_connections(id,provider,display_name,status,auth_mode,config_json,last_synced_at,last_error)),external_evidence(id,finalization_id,requirement_id,binding_id,provider,evidence_status,summary,evidence_json,observed_at,created_at)')
    .eq('organization_id', ctx.organization.id)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapFinalization(data, ctx.user.id) : null;
}

export async function writeAudit(ctx, finalizationId, eventType, text, data = {}) {
  await ctx.db.from('audit_events').insert({
    organization_id: ctx.organization.id,
    finalization_id: finalizationId,
    actor_user_id: ctx.user?.id || null,
    event_type: eventType,
    event_data: { text, actor: ctx.user?.email || 'Finalize', ...data },
  });
}

export async function readinessFromDb(ctx, id) {
  const [reqRes, aprRes, fileRes, secureRes, payRes, privacyRes, finRes, annRes, docRes, artifactRes, integrationRes] = await Promise.all([
    ctx.db.from('requirements').select('id,required,status').eq('finalization_id', id),
    ctx.db.from('approvals').select('status,artifact_version').eq('finalization_id', id).limit(1).maybeSingle(),
    ctx.db.from('file_requests').select('id,title,required,status').eq('finalization_id', id),
    ctx.db.from('secure_requests').select('id,title,status').eq('finalization_id', id),
    ctx.db.from('payment_gates').select('id,label,status').eq('finalization_id', id),
    ctx.db.from('privacy_closeout_items').select('id,title,required,status').eq('finalization_id', id),
    ctx.db.from('finalizations').select('artifact_version').eq('id', id).maybeSingle(),
    ctx.db.from('review_annotations').select('id,status,artifact_version').eq('finalization_id', id),
    ctx.db.from('document_findings').select('id,title,severity,status,artifact_id,artifact_version').eq('finalization_id', id).eq('severity','BLOCKER').eq('status','OPEN'),
    ctx.db.from('artifacts').select('id,original_filename,status,parser_status,document_analysis_status').eq('finalization_id',id).neq('status','DELETED'),
    ctx.db.from('integration_bindings').select('id,signal_key,expected_state,status,required,requirement_id').eq('finalization_id',id),
  ]);
  for (const result of [reqRes,fileRes,secureRes,payRes,privacyRes,finRes,annRes,docRes,artifactRes,integrationRes]) if (result.error) throw result.error;
  if (aprRes.error) throw aprRes.error;
  const blockers = [];
  for (const r of reqRes.data || []) if (r.required && !['passed','waived'].includes(r.status)) blockers.push({ source:'requirement', ...r });
  for (const r of fileRes.data || []) if (r.required && !['received','waived'].includes(r.status)) blockers.push({ source:'file_request', ...r });
  for (const r of secureRes.data || []) if (!['submitted','viewed','destroyed'].includes(r.status)) blockers.push({ source:'secure_request', ...r });
  for (const r of payRes.data || []) if (!['paid','waived'].includes(r.status)) blockers.push({ source:'payment', ...r });
  for (const r of privacyRes.data || []) if (r.required && !['resolved','waived','scheduled'].includes(r.status)) blockers.push({ source:'privacy', ...r });
  for (const b of integrationRes.data || []) if (b.required && !b.requirement_id && b.status !== 'satisfied') blockers.push({ source:'integration', id:b.id, title:`${b.signal_key} must reach ${b.expected_state}`, status:b.status });
  const version = Number(finRes.data?.artifact_version || 1);
  for (const r of annRes.data || []) if (Number(r.artifact_version) === version && r.status === 'open') blockers.push({ source:'review', ...r });
  for (const r of docRes.data || []) if (r.artifact_version == null || Number(r.artifact_version) === version) blockers.push({ source:'document', ...r });
  for (const a of artifactRes.data || []) {
    if (['UPLOADING','QUARANTINED','VERIFYING','SCANNING','PROCESSING'].includes(a.status)) blockers.push({ source:'artifact_processing', id:a.id, title:`${a.original_filename} is still being processed`, status:a.status });
    if (a.status === 'READY' && a.parser_status === 'COMPLETE' && !['COMPLETE','LIMITED'].includes(a.document_analysis_status || 'PENDING')) blockers.push({ source:'document_processing', id:a.id, title:`${a.original_filename} document checks are still running`, status:a.document_analysis_status || 'PENDING' });
  }
  const approvalStatus = aprRes.data?.status || 'not_requested';
  const approvalMatchesVersion = approvalStatus === 'approved' && Number(aprRes.data?.artifact_version) === version;
  return { blockers, approvalStatus, readyForApproval: blockers.length === 0, readyToFinalize: blockers.length === 0 && approvalMatchesVersion, approvalMatchesVersion };
}
