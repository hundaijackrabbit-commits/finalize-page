import { NextResponse } from 'next/server';
import { getFinalization, listFinalizations, requireAuthContext, writeAudit } from '../../../lib/repository/finalizations';
import { PHASE2_TEMPLATES } from '../../../lib/phase2-templates';

export async function GET() {
  const ctx = await requireAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  try {
    const finalizations = await listFinalizations(ctx);
    return NextResponse.json({
      workspace: { id: ctx.organization.id, name: ctx.organization.name, brandName: ctx.organization.brand_name || ctx.organization.name, brandAccent: ctx.organization.brand_accent || '#182018', brandLogoUrl: ctx.organization.brand_logo_url || null, customDomain: ctx.organization.custom_domain || null, plan: ctx.organization.plan, memberCount: null, currentUser: { id: ctx.user.id, name: ctx.user.user_metadata?.full_name || ctx.user.email, initials: (ctx.user.user_metadata?.full_name || ctx.user.email || '?').slice(0,2).toUpperCase(), role: ctx.membership.role } },
      finalizations,
    });
  } catch (error) {
    return NextResponse.json({ error: 'load_failed', detail: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const ctx = await requireAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  try {
    const body = await request.json();
    const title = String(body.title || '').trim().slice(0,160);
    if (!title) return NextResponse.json({ error: 'title_required' }, { status: 400 });
    const { data: finalization, error } = await ctx.db.from('finalizations').insert({
      organization_id: ctx.organization.id,
      title,
      type: String(body.type || 'Client project').slice(0,80),
      counterpart_name: String(body.client || '').trim().slice(0,160) || null,
      state: 'DRAFT',
      template_key: String(body.templateKey || '').slice(0,120) || null,
      review_url: body.reviewUrl || null,
      created_by: ctx.user.id,
    }).select().single();
    if (error) throw error;
    const displayName = ctx.user.user_metadata?.full_name || ctx.user.email || 'Workspace owner';
    const { data: participant, error: partError } = await ctx.db.from('finalization_participants').insert({
      finalization_id: finalization.id,
      user_id: ctx.user.id,
      display_name: displayName,
      email: ctx.user.email,
      role: 'Owner',
    }).select().single();
    if (partError) throw partError;
    const template = PHASE2_TEMPLATES.find((t) => t.key === body.templateKey);
    const requirementRows = template ? template.requirements.map((r, position) => ({
      finalization_id: finalization.id, title: r[0], category: r[1], type: r[2], required: r[3], status: 'open', owner_participant_id: participant.id, position,
    })) : [{ finalization_id: finalization.id, title: 'Define what done means', category: 'Setup', type: 'human', required: true, status: 'open', owner_participant_id: participant.id, position: 0 }];
    const { error: reqError } = await ctx.db.from('requirements').insert(requirementRows);
    if (reqError) throw reqError;
    if (template?.key === 'agency-website-launch') {
      await ctx.db.from('privacy_closeout_items').insert([
        { finalization_id: finalization.id, item_type: 'guest_link', title: 'Revoke client review links', description: 'Close temporary review access when the project is finalized.', required: true, status: 'scheduled' },
        { finalization_id: finalization.id, item_type: 'access', title: 'Remove temporary production access', description: 'Verify temporary developer/client access is removed or transferred.', required: true, status: 'open' },
      ]);
    }
    const { error: aprError } = await ctx.db.from('approvals').insert({
      finalization_id: finalization.id,
      title: 'Final approval',
      reviewer_participant_id: participant.id,
      status: 'not_requested',
      artifact_version: 1,
    });
    if (aprError) throw aprError;
    await ctx.db.from('finalization_versions').insert({ finalization_id: finalization.id, version_number: 1, reason: 'room_created', created_by: ctx.user.id });
    await writeAudit(ctx, finalization.id, 'finalization.created', 'Finalization created');
    return NextResponse.json({ finalization: await getFinalization(ctx, finalization.id) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'create_failed', detail: error.message }, { status: 500 });
  }
}
