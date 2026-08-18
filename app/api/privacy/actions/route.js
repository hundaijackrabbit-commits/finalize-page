import { NextResponse } from 'next/server';
import { requireAuthContext } from '../../../../lib/repository/finalizations';

function clean(value, max = 500) { return String(value || '').trim().slice(0, max); }

export async function POST(request) {
  const ctx = await requireAuthContext(); if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!['owner','admin'].includes(ctx.membership.role)) return NextResponse.json({ error: 'admin_required' }, { status: 403 });
  try {
    const body = await request.json(); const action = clean(body.action, 80); const now = new Date().toISOString();
    if (action === 'revoke_all_guest_links') {
      const { data: fins, error: fError } = await ctx.db.from('finalizations').select('id').eq('organization_id', ctx.organization.id); if (fError) throw fError;
      const ids = (fins || []).map((f) => f.id);
      if (ids.length) { const { error } = await ctx.db.from('guest_access_grants').update({ revoked_at: now }).in('finalization_id', ids).is('revoked_at', null); if (error) throw error; }
      await ctx.db.from('privacy_events').insert({ organization_id: ctx.organization.id, actor_user_id: ctx.user.id, event_type: 'guest_access.bulk_revoked', event_data: { countScope: ids.length } });
      return NextResponse.json({ ok: true });
    }
    if (action === 'schedule_artifact_deletion') {
      const artifactId = clean(body.artifactId, 80); if (!artifactId) return NextResponse.json({ error: 'artifact_required' }, { status: 400 });
      const { data: artifact, error: aError } = await ctx.db.from('artifacts').select('id,finalization_id,original_filename').eq('id', artifactId).eq('organization_id', ctx.organization.id).maybeSingle(); if (aError) throw aError; if (!artifact) return NextResponse.json({ error: 'artifact_not_found' }, { status: 404 });
      const executeAfter = body.executeAfter ? new Date(body.executeAfter).toISOString() : now;
      const { data, error } = await ctx.db.from('privacy_disposal_requests').insert({ organization_id: ctx.organization.id, finalization_id: artifact.finalization_id, artifact_id: artifact.id, request_type: 'artifact_delete', status: 'scheduled', reason: clean(body.reason, 500) || 'User-requested privacy disposal', execute_after: executeAfter, requested_by: ctx.user.id }).select('*').single(); if (error) throw error;
      await ctx.db.from('artifacts').update({ retention_delete_after: executeAfter }).eq('id', artifact.id).eq('organization_id', ctx.organization.id);
      await ctx.db.from('privacy_events').insert({ organization_id: ctx.organization.id, finalization_id: artifact.finalization_id, artifact_id: artifact.id, actor_user_id: ctx.user.id, event_type: 'artifact.deletion_scheduled', event_data: { filename: artifact.original_filename, executeAfter } });
      return NextResponse.json({ request: data });
    }
    if (action === 'destroy_all_live_credentials') {
      const { data: fins, error: fError } = await ctx.db.from('finalizations').select('id').eq('organization_id', ctx.organization.id); if (fError) throw fError;
      const ids = (fins || []).map((f) => f.id); if (ids.length) {
        const { error } = await ctx.db.from('secure_requests').update({ status: 'destroyed', encrypted_payload: null, payload_iv: null, payload_tag: null, destroyed_at: now }).in('finalization_id', ids).in('status', ['submitted','viewed']); if (error) throw error;
      }
      await ctx.db.from('privacy_events').insert({ organization_id: ctx.organization.id, actor_user_id: ctx.user.id, event_type: 'credentials.bulk_destroyed', event_data: {} });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: 'privacy_action_failed', detail: error.message }, { status: 500 }); }
}
