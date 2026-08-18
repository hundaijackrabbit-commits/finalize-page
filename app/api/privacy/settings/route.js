import { NextResponse } from 'next/server';
import { requireAuthContext } from '../../../../lib/repository/finalizations';
import { loadPrivacySettings, mapPrivacySettings } from '../../../../lib/privacy/policy';

function boundedInt(value, fallback, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback; }

export async function GET() {
  const ctx = await requireAuthContext(); if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  try { return NextResponse.json({ settings: await loadPrivacySettings(ctx.db, ctx.organization.id) }); }
  catch (error) { return NextResponse.json({ error: 'privacy_settings_failed', detail: error.message }, { status: 500 }); }
}

export async function POST(request) {
  const ctx = await requireAuthContext(); if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!['owner','admin'].includes(ctx.membership.role)) return NextResponse.json({ error: 'admin_required' }, { status: 403 });
  try {
    const body = await request.json();
    const patch = {
      organization_id: ctx.organization.id,
      ai_processing_enabled: body.aiProcessingEnabled !== false,
      allow_business_ai: body.allowBusinessAi !== false,
      allow_confidential_ai: Boolean(body.allowConfidentialAi),
      allow_restricted_ai: Boolean(body.allowRestrictedAi),
      require_redaction_for_ai: body.requireRedactionForAi !== false,
      source_retention_days: boundedInt(body.sourceRetentionDays, 30, 1, 3650),
      derived_retention_days: boundedInt(body.derivedRetentionDays, 30, 1, 3650),
      evidence_retention_days: boundedInt(body.evidenceRetentionDays, 365, 1, 3650),
      guest_link_ttl_days: boundedInt(body.guestLinkTtlDays, 7, 1, 90),
      auto_revoke_guests_on_finalize: body.autoRevokeGuestsOnFinalize !== false,
      auto_destroy_credentials_on_finalize: body.autoDestroyCredentialsOnFinalize !== false,
      data_region: ['north-america','canada','united-states','europe','custom'].includes(body.dataRegion) ? body.dataRegion : 'north-america',
      updated_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await ctx.db.from('workspace_privacy_settings').upsert(patch).select('*').single(); if (error) throw error;
    await ctx.db.from('privacy_events').insert({ organization_id: ctx.organization.id, actor_user_id: ctx.user.id, event_type: 'workspace.privacy_settings_updated', event_data: { changed: Object.keys(patch).filter((k) => !['organization_id','updated_by','updated_at'].includes(k)) } });
    return NextResponse.json({ settings: mapPrivacySettings(data) });
  } catch (error) { return NextResponse.json({ error: 'privacy_settings_update_failed', detail: error.message }, { status: 400 }); }
}
