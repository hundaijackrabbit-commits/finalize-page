import { createSupabaseAdminClient } from '../supabase/admin';
import { mapFinalization, tokenHash } from './finalizations';

const GUEST_SELECT = '*,finalization_participants(*),requirements(*),comments(*),approvals(*),finalization_records(*),audit_events(*),review_annotations(*),finalization_versions(*),file_requests(*),secure_requests(id,title,request_type,participant_id,status,expires_at,submitted_at,destroyed_at,created_at),payment_gates(*)';

export async function resolveGuestGrant(token) {
  const admin = createSupabaseAdminClient();
  const hash = tokenHash(token);
  const { data: grant, error } = await admin.from('guest_access_grants').select('*').eq('token_hash', hash).maybeSingle();
  if (error || !grant) return { error: 'unavailable', status: 404 };
  if (grant.revoked_at || new Date(grant.expires_at) <= new Date()) return { error: 'expired', status: 410 };
  const { data: row, error: finalizationError } = await admin.from('finalizations').select(GUEST_SELECT).eq('id', grant.finalization_id).maybeSingle();
  if (finalizationError || !row) return { error: 'unavailable', status: 404 };
  return { admin, grant, row, finalization: mapFinalization(row, null) };
}

export function safeGuestFinalization(ctx) {
  const reviewer = ctx.finalization.participants.find((p) => p.id === ctx.grant.participant_id);
  return {
    ...ctx.finalization,
    participants: reviewer ? [reviewer] : [],
    comments: ctx.finalization.comments.filter((c) => c.authorId === ctx.grant.participant_id),
    requirements: ctx.finalization.requirements.filter((r) => r.ownerId === ctx.grant.participant_id),
    annotations: (ctx.finalization.annotations || []).filter((a) => a.artifactVersion === ctx.finalization.artifactVersion && a.visibility === 'shared'),
    fileRequests: (ctx.finalization.fileRequests || []).filter((r) => r.participantId === ctx.grant.participant_id),
    secureRequests: (ctx.finalization.secureRequests || []).filter((r) => r.participantId === ctx.grant.participant_id),
    paymentGates: (ctx.finalization.paymentGates || []).map((g) => ({ id:g.id,label:g.label,amountCents:g.amountCents,currency:g.currency,paymentUrl:g.paymentUrl,status:g.status,paidAt:g.paidAt })),
    privacyItems: [], reminders: [], activity: [], artifacts: [],
    shareExpires: ctx.grant.expires_at,
  };
}
