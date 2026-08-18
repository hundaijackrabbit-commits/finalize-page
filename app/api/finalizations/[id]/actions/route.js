import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getFinalization, readinessFromDb, requireAuthContext, tokenHash, writeAudit } from '../../../../../lib/repository/finalizations';
import { loadPrivacySettings } from '../../../../../lib/privacy/policy';

function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
function clean(value, max = 220) { return String(value || '').trim().slice(0, max); }

export async function POST(request, { params }) {
  const ctx = await requireAuthContext();
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const current = await getFinalization(ctx, id);
  if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'set_requirement_status') {
      const status = ['open','checking','passed','waived'].includes(body.status) ? body.status : 'open';
      const { error } = await ctx.db.from('requirements').update({ status, evidence_summary: body.evidence ?? undefined, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', body.requirementId).eq('finalization_id', id);
      if (error) throw error;
      await ctx.db.from('finalizations').update({ state: 'RESOLVING', updated_at: new Date().toISOString() }).eq('id', id);
      await writeAudit(ctx, id, status === 'passed' ? 'requirement.passed' : 'requirement.changed', `Requirement ${status === 'passed' ? 'completed' : 'updated'}`, { requirementId: body.requirementId });
    } else if (action === 'recheck_requirement') {
      const { error } = await ctx.db.from('requirements').update({ status: 'checking', evidence_summary: 'Automated re-check queued', updated_at: new Date().toISOString() }).eq('id', body.requirementId).eq('finalization_id', id).eq('type','automated');
      if (error) throw error;
      await writeAudit(ctx, id, 'check.queued', 'Automated requirement queued for re-check', { requirementId: body.requirementId });
    } else if (action === 'add_participant') {
      const name = clean(body.name, 160); const email = clean(body.email, 254).toLowerCase() || null; const role = clean(body.role || 'Reviewer', 80);
      if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });
      const { data: participant, error } = await ctx.db.from('finalization_participants').insert({ finalization_id: id, display_name: name, email, role }).select().single();
      if (error) throw error;
      if (body.asReviewer !== false) await ctx.db.from('approvals').update({ reviewer_participant_id: participant.id, status: 'not_requested', requested_at: null, approved_at: null, artifact_version: current.artifactVersion }).eq('finalization_id', id);
      await writeAudit(ctx, id, 'participant.created', `${name} added as ${role}`);
    } else if (action === 'add_requirement') {
      const title = clean(body.title); if (!title) return NextResponse.json({ error: 'title_required' }, { status: 400 });
      const { error } = await ctx.db.from('requirements').insert({ finalization_id: id, title, category: clean(body.category || 'Closeout',80), type: ['human','automated','integration','ai'].includes(body.type) ? body.type : 'human', required: body.required !== false, status: 'open', owner_participant_id: body.ownerId || null, depends_on_requirement_id: body.dependsOnId || null, resolution_action: clean(body.resolutionAction,120) || null, position: current.requirements.length });
      if (error) throw error; await writeAudit(ctx,id,'requirement.created',`Requirement added: ${title}`);
    } else if (action === 'add_comment') {
      const text = clean(body.body,5000); if (!text) return NextResponse.json({ error:'comment_required' },{status:400});
      const me = current.participants.find((p)=>p.userId===ctx.user.id);
      const { error } = await ctx.db.from('comments').insert({ finalization_id:id, requirement_id:body.requirementId||null, author_participant_id:me?.id||null, body:text });
      if (error) throw error; await writeAudit(ctx,id,'comment.created','Comment added');
    } else if (action === 'add_annotation') {
      const text=clean(body.body,3000); if(!text)return NextResponse.json({error:'comment_required'},{status:400});
      const me=current.participants.find((p)=>p.userId===ctx.user.id);
      const x=Math.max(0,Math.min(100,Number(body.x)||0)); const y=Math.max(0,Math.min(100,Number(body.y)||0));
      const {error}=await ctx.db.from('review_annotations').insert({finalization_id:id,artifact_version:current.artifactVersion,target_type:['website','image','pdf','file'].includes(body.targetType)?body.targetType:'website',target_ref:clean(body.targetRef,500)||null,x_pct:x,y_pct:y,body:text,visibility:body.visibility==='shared'?'shared':'internal',author_participant_id:me?.id||null});
      if(error)throw error; await writeAudit(ctx,id,'review.annotation_created','Review annotation added',{artifactVersion:current.artifactVersion});
    } else if (action === 'resolve_annotation') {
      const {error}=await ctx.db.from('review_annotations').update({status:'resolved',resolved_at:new Date().toISOString()}).eq('id',body.annotationId).eq('finalization_id',id).eq('artifact_version',current.artifactVersion);
      if(error)throw error; await writeAudit(ctx,id,'review.annotation_resolved','Review feedback resolved');
    } else if (action === 'add_file_request') {
      const title=clean(body.title); if(!title)return NextResponse.json({error:'title_required'},{status:400});
      const extensions=Array.isArray(body.acceptedExtensions)?body.acceptedExtensions.map((x)=>clean(x,12).replace(/^\./,'').toLowerCase()).filter(Boolean).slice(0,20):[];
      const {error}=await ctx.db.from('file_requests').insert({finalization_id:id,title,description:clean(body.description,1000)||null,accepted_extensions:extensions,required:body.required!==false,participant_id:body.participantId||current.approval.reviewerId||null});
      if(error)throw error; await writeAudit(ctx,id,'file_request.created',`File requested: ${title}`);
    } else if (action === 'complete_file_request') {
      const {error}=await ctx.db.from('file_requests').update({status:'received',completed_at:new Date().toISOString()}).eq('id',body.requestId).eq('finalization_id',id).eq('status','requested');
      if(error)throw error; await writeAudit(ctx,id,'file_request.received','Requested file marked received');
    } else if (action === 'add_secure_request') {
      const title=clean(body.title); if(!title)return NextResponse.json({error:'title_required'},{status:400});
      const expiresAt=new Date(Date.now()+7*24*60*60*1000).toISOString();
      const {error}=await ctx.db.from('secure_requests').insert({finalization_id:id,title,request_type:['credential','access','secret','other'].includes(body.requestType)?body.requestType:'credential',participant_id:body.participantId||current.approval.reviewerId||null,expires_at:expiresAt});
      if(error)throw error; await writeAudit(ctx,id,'secure_request.created',`Secure request created: ${title}`);
    } else if (action === 'destroy_secure_request') {
      const {error}=await ctx.db.from('secure_requests').update({status:'destroyed',encrypted_payload:null,payload_iv:null,payload_tag:null,destroyed_at:new Date().toISOString()}).eq('id',body.requestId).eq('finalization_id',id);
      if(error)throw error;
      await ctx.db.from('privacy_closeout_items').update({status:'resolved',resolved_at:new Date().toISOString()}).eq('finalization_id',id).eq('item_type','credential').eq('status','open');
      await writeAudit(ctx,id,'vault.secret_destroyed','Encrypted secure-request payload destroyed');
    } else if (action === 'set_payment_status') {
      const status=['unpaid','pending','paid','waived','refunded'].includes(body.status)?body.status:'unpaid';
      const {error}=await ctx.db.from('payment_gates').update({status,paid_at:status==='paid'?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',body.paymentId).eq('finalization_id',id);
      if(error)throw error;
      if(status==='paid') await ctx.db.from('requirements').update({status:'passed',evidence_summary:'Payment gate confirmed',last_checked_at:new Date().toISOString()}).eq('finalization_id',id).eq('category','Payment').eq('required',true);
      await writeAudit(ctx,id,status==='paid'?'payment.received':'payment.changed',status==='paid'?'Payment received':'Payment status updated');
    } else if (action === 'create_payment_gate') {
      const label=clean(body.label||'Final payment'); const amount=Number(body.amountCents);
      const {error}=await ctx.db.from('payment_gates').insert({finalization_id:id,label,amount_cents:Number.isInteger(amount)&&amount>=0?amount:null,currency:clean(body.currency||'CAD',3).toUpperCase(),provider:'manual',provider_reference:clean(body.reference,120)||null,payment_url:clean(body.paymentUrl,1000)||null});
      if(error)throw error; await writeAudit(ctx,id,'payment.gate_created',`Payment gate created: ${label}`);
    } else if (action === 'set_privacy_item_status') {
      const status=['open','resolved','scheduled','waived'].includes(body.status)?body.status:'open';
      const {error}=await ctx.db.from('privacy_closeout_items').update({status,resolved_at:status==='resolved'?new Date().toISOString():null}).eq('id',body.itemId).eq('finalization_id',id);
      if(error)throw error; await writeAudit(ctx,id,'privacy.closeout_changed',`Privacy closeout item ${status}`);
    } else if (action === 'add_privacy_item') {
      const title=clean(body.title); if(!title)return NextResponse.json({error:'title_required'},{status:400});
      const {error}=await ctx.db.from('privacy_closeout_items').insert({finalization_id:id,item_type:['guest_link','credential','temporary_file','test_account','retention','access','other'].includes(body.itemType)?body.itemType:'other',title,description:clean(body.description,1000)||null,required:body.required!==false});
      if(error)throw error; await writeAudit(ctx,id,'privacy.closeout_created',`Privacy closeout item added: ${title}`);
    } else if (action === 'send_reminder') {
      const participantId=body.participantId||current.approval.reviewerId; if(!participantId)return NextResponse.json({error:'participant_required'},{status:400});
      const subject=`Items still needed to finalize ${current.title}`.slice(0,240);
      const {error}=await ctx.db.from('reminders').insert({finalization_id:id,participant_id:participantId,channel:'email',subject,status:'scheduled',send_at:new Date().toISOString()});
      if(error)throw error; await writeAudit(ctx,id,'reminder.queued','Client reminder queued');
    } else if (action === 'update_review_url') {
      let reviewUrl=null;
      if(body.reviewUrl){ try { const parsed=new URL(body.reviewUrl); if(!['http:','https:'].includes(parsed.protocol))throw new Error(); reviewUrl=parsed.toString(); } catch { return NextResponse.json({error:'invalid_url'},{status:400}); } }
      const {error}=await ctx.db.from('finalizations').update({review_url:reviewUrl,updated_at:new Date().toISOString()}).eq('id',id).eq('organization_id',ctx.organization.id);
      if(error)throw error; await writeAudit(ctx,id,'review.url_updated','Review target updated');
    } else if (action === 'request_approval') {
      const ready=await readinessFromDb(ctx,id); if(!ready.readyForApproval)return NextResponse.json({error:'blockers_remain',blockers:ready.blockers},{status:409});
      const {error}=await ctx.db.from('approvals').update({status:'pending',requested_at:new Date().toISOString(),artifact_version:current.artifactVersion,approved_at:null}).eq('finalization_id',id);
      if(error)throw error; await ctx.db.from('finalizations').update({state:'READY',updated_at:new Date().toISOString()}).eq('id',id); await writeAudit(ctx,id,'approval.requested',`Final approval requested for artifact v${current.artifactVersion}`);
    } else if (action === 'approve') {
      const me=current.participants.find((p)=>p.userId===ctx.user.id); if(!me||me.id!==current.approval.reviewerId)return NextResponse.json({error:'reviewer_required'},{status:403});
      const {error}=await ctx.db.from('approvals').update({status:'approved',approved_at:new Date().toISOString(),artifact_version:current.artifactVersion}).eq('finalization_id',id).eq('status','pending');
      if(error)throw error; await writeAudit(ctx,id,'approval.approved',`Final approval received for artifact v${current.artifactVersion}`);
    } else if (action === 'finalize') {
      const ready=await readinessFromDb(ctx,id); if(!ready.readyToFinalize)return NextResponse.json({error:'not_ready',blockers:ready.blockers},{status:409});
      const {data:activeRecord,error:activeRecordError}=await ctx.db.from('finalization_records').select('id').eq('finalization_id',id).eq('record_status','active').limit(1).maybeSingle(); if(activeRecordError)throw activeRecordError; if(activeRecord)return NextResponse.json({finalization:await getFinalization(ctx,id)});
      const {data:previousRecord}=await ctx.db.from('finalization_records').select('id').eq('finalization_id',id).order('finalized_at',{ascending:false}).limit(1).maybeSingle();
      const passedCount=current.requirements.filter((r)=>['passed','waived'].includes(r.status)).length;
      const [{data:readyArtifacts,error:artifactError},{data:payments},{data:privacy}] = await Promise.all([
        ctx.db.from('artifacts').select('id,original_filename,source_sha256').eq('finalization_id',id).eq('status','READY'),
        ctx.db.from('payment_gates').select('label,status,amount_cents,currency,paid_at').eq('finalization_id',id),
        ctx.db.from('privacy_closeout_items').select('title,status,item_type').eq('finalization_id',id),
      ]);
      if(artifactError)throw artifactError;
      const artifactProof=(readyArtifacts||[]).filter((a)=>a.source_sha256).sort((a,b)=>a.id.localeCompare(b.id)).map((a)=>`${a.id}:${a.source_sha256}`).join('|');
      const proofInput=artifactProof||`${id}:${current.artifactVersion}:no-ready-artifact`;
      const fingerprint=`SHA256:${crypto.createHash('sha256').update(proofInput).digest('hex')}`; const publicId=`F-${crypto.randomInt(100000,999999)}`;
      const recordJson={finalizationId:id,title:current.title,artifactVersion:current.artifactVersion,passedRequirementCount:passedCount,finalizedAt:new Date().toISOString(),artifacts:(readyArtifacts||[]).map((a)=>({id:a.id,name:a.original_filename,sha256:a.source_sha256})),payments:payments||[],privacyCloseout:privacy||[],approval:{status:'approved',artifactVersion:current.artifactVersion}};
      const {error:recordError}=await ctx.db.from('finalization_records').insert({public_record_id:publicId,finalization_id:id,artifact_version:current.artifactVersion,artifact_fingerprint:fingerprint,passed_requirement_count:passedCount,record_json:recordJson,finalized_by:ctx.user.id,record_status:'active',supersedes_record_id:previousRecord?.id||null}); if(recordError)throw recordError;
      const now=new Date().toISOString();
      const privacySettings=await loadPrivacySettings(ctx.db,ctx.organization.id);
      const cleanup=[];
      if(privacySettings.autoRevokeGuestsOnFinalize) cleanup.push(ctx.db.from('guest_access_grants').update({revoked_at:now}).eq('finalization_id',id).is('revoked_at',null));
      if(privacySettings.autoDestroyCredentialsOnFinalize) cleanup.push(ctx.db.from('secure_requests').update({status:'destroyed',encrypted_payload:null,payload_iv:null,payload_tag:null,destroyed_at:now}).eq('finalization_id',id).in('status',['submitted','viewed']));
      cleanup.push(ctx.db.from('privacy_closeout_items').update({status:'resolved',resolved_at:now}).eq('finalization_id',id).in('status',['scheduled']));
      cleanup.push(ctx.db.from('finalizations').update({state:'FINALIZED',finalized_at:now,updated_at:now,handoff_status:'COMPLETE',privacy_closeout_status:'COMPLETE'}).eq('id',id));
      await Promise.all(cleanup);
      await ctx.db.from('privacy_events').insert({organization_id:ctx.organization.id,finalization_id:id,actor_user_id:ctx.user.id,event_type:'finalization.privacy_finalized',event_data:{autoRevokeGuests:privacySettings.autoRevokeGuestsOnFinalize,autoDestroyCredentials:privacySettings.autoDestroyCredentialsOnFinalize,policyVersion:'phase3.v1'}});
      await writeAudit(ctx,id,'finalization.completed','Finalization completed, privacy policy applied, and record sealed');
    } else if (action === 'create_guest_link') {
      const participantId=body.participantId||current.approval.reviewerId; if(!participantId)return NextResponse.json({error:'reviewer_required'},{status:400});
      const privacySettings=await loadPrivacySettings(ctx.db,ctx.organization.id); const token=randomToken(); const expiresAt=new Date(Date.now()+privacySettings.guestLinkTtlDays*24*60*60*1000).toISOString();
      await ctx.db.from('guest_access_grants').update({revoked_at:new Date().toISOString()}).eq('finalization_id',id).eq('participant_id',participantId).is('revoked_at',null);
      const {error}=await ctx.db.from('guest_access_grants').insert({finalization_id:id,participant_id:participantId,token_hash:tokenHash(token),expires_at:expiresAt,require_email_verification:false}); if(error)throw error;
      await writeAudit(ctx,id,'guest.link_created','Secure guest review link created'); return NextResponse.json({finalization:await getFinalization(ctx,id),guest:{token,expiresAt}});
    } else return NextResponse.json({error:'unknown_action'},{status:400});

    return NextResponse.json({ finalization: await getFinalization(ctx, id) });
  } catch (error) {
    return NextResponse.json({ error: 'action_failed', detail: error.message }, { status: 500 });
  }
}
