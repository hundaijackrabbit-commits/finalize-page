import { NextResponse } from 'next/server';
import { resolveGuestGrant, safeGuestFinalization } from '../../../../lib/repository/guest';
import { encryptVaultPayload } from '../../../../lib/vault';

function roomScore(f) {
  const required=(f.requirements||[]).filter((r)=>r.required); const reqOpen=required.filter((r)=>!['passed','waived'].includes(r.status)).length;
  const fileTotal=(f.fileRequests||[]).filter((r)=>r.required).length; const fileOpen=(f.fileRequests||[]).filter((r)=>r.required&&!['received','waived'].includes(r.status)).length;
  const secTotal=(f.secureRequests||[]).length; const secOpen=(f.secureRequests||[]).filter((r)=>!['submitted','viewed','destroyed'].includes(r.status)).length;
  const payTotal=(f.paymentGates||[]).length; const payOpen=(f.paymentGates||[]).filter((g)=>!['paid','waived'].includes(g.status)).length;
  const reviewTotal=(f.annotations||[]).filter((a)=>a.artifactVersion===f.artifactVersion).length; const reviewOpen=(f.annotations||[]).filter((a)=>a.artifactVersion===f.artifactVersion&&a.status==='open').length;
  const total=Math.max(required.length+fileTotal+secTotal+payTotal+reviewTotal,1); const open=reqOpen+fileOpen+secOpen+payOpen+reviewOpen;
  return Math.max(0,Math.round(((total-open)/total)*100));
}
async function guestAudit(ctx,eventType,text,data={}){await ctx.admin.from('audit_events').insert({organization_id:ctx.row.organization_id,finalization_id:ctx.row.id,actor_participant_id:ctx.grant.participant_id,event_type:eventType,event_data:{text,actor:'Guest reviewer',...data}});}
async function payloadFor(token) {
  const ctx=await resolveGuestGrant(token); if(ctx.error)return ctx;
  const reviewer=ctx.finalization.participants.find((p)=>p.id===ctx.grant.participant_id);
  const {data:org}=await ctx.admin.from('organizations').select('name,brand_name,brand_accent,brand_logo_url').eq('id',ctx.row.organization_id).maybeSingle();
  return {ctx,body:{finalization:safeGuestFinalization(ctx),reviewer,workspaceName:org?.brand_name||org?.name||'Finalize workspace',brand:{name:org?.brand_name||org?.name||'Finalize workspace',accent:org?.brand_accent||'#182018',logoUrl:org?.brand_logo_url||null},roomReadiness:roomScore(ctx.finalization)}};
}

export async function GET(_request,{params}) {
  const {token}=await params;
  try { const result=await payloadFor(token); if(result.error)return NextResponse.json({error:result.error},{status:result.status}); return NextResponse.json(result.body); }
  catch(error){ return NextResponse.json({error:'guest_load_failed',detail:error.message},{status:500}); }
}

export async function POST(request,{params}) {
  const {token}=await params;
  try {
    const result=await payloadFor(token); if(result.error)return NextResponse.json({error:result.error},{status:result.status});
    const {ctx}=result; const body=await request.json(); const action=body.action;
    if(action==='complete_requirement'){
      const target=ctx.row.requirements.find((r)=>r.id===body.requirementId);
      if(!target||target.owner_participant_id!==ctx.grant.participant_id||target.type!=='human')return NextResponse.json({error:'not_allowed'},{status:403});
      const {error}=await ctx.admin.from('requirements').update({status:'passed',evidence_summary:'Completed through secure guest review',last_checked_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',target.id); if(error)throw error; await guestAudit(ctx,'guest.requirement_completed','Guest completed an assigned requirement',{requirementId:target.id});
    } else if(action==='comment'){
      const text=String(body.body||'').trim().slice(0,5000); if(!text)return NextResponse.json({error:'comment_required'},{status:400});
      const requirementId=body.requirementId||null; if(requirementId){const target=ctx.row.requirements.find((r)=>r.id===requirementId);if(!target||target.owner_participant_id!==ctx.grant.participant_id)return NextResponse.json({error:'not_allowed'},{status:403});}
      const {error}=await ctx.admin.from('comments').insert({finalization_id:ctx.grant.finalization_id,requirement_id:requirementId,author_participant_id:ctx.grant.participant_id,body:text});if(error)throw error; await guestAudit(ctx,'guest.comment_created','Guest added a review note',{requirementId});
    } else if(action==='approve'){
      const approval=ctx.row.approvals?.[0]; if(!approval||approval.reviewer_participant_id!==ctx.grant.participant_id||approval.status!=='pending'||approval.artifact_version!==ctx.row.artifact_version)return NextResponse.json({error:'not_allowed_or_version_changed'},{status:409});
      const {error}=await ctx.admin.from('approvals').update({status:'approved',approved_at:new Date().toISOString(),artifact_version:ctx.row.artifact_version}).eq('id',approval.id);if(error)throw error; await guestAudit(ctx,'guest.approval_recorded',`Guest approved artifact v${ctx.row.artifact_version}`,{artifactVersion:ctx.row.artifact_version});
    } else if(action==='add_annotation'){
      const text=String(body.body||'').trim().slice(0,3000); if(!text)return NextResponse.json({error:'comment_required'},{status:400});
      const x=Math.max(0,Math.min(100,Number(body.x)||0));const y=Math.max(0,Math.min(100,Number(body.y)||0));
      const {error}=await ctx.admin.from('review_annotations').insert({finalization_id:ctx.grant.finalization_id,artifact_version:ctx.row.artifact_version,target_type:'website',target_ref:String(body.targetRef||'/').slice(0,500),x_pct:x,y_pct:y,body:text,visibility:'shared',author_participant_id:ctx.grant.participant_id});if(error)throw error; await guestAudit(ctx,'guest.annotation_created','Guest added visual feedback',{artifactVersion:ctx.row.artifact_version});
    } else if(action==='submit_secure_request'){
      const target=ctx.row.secure_requests?.find((r)=>r.id===body.requestId);
      if(!target||target.participant_id!==ctx.grant.participant_id||target.status!=='requested')return NextResponse.json({error:'not_allowed'},{status:403});
      const fields=body.fields&&typeof body.fields==='object'?body.fields:{}; const clean={}; for(const [k,v] of Object.entries(fields).slice(0,12)){const key=String(k).slice(0,80);const value=String(v||'').slice(0,4000);if(key&&value)clean[key]=value;}
      if(!Object.keys(clean).length)return NextResponse.json({error:'secret_required'},{status:400});
      let encrypted; try{encrypted=encryptVaultPayload(clean);}catch(error){return NextResponse.json({error:'vault_not_configured',detail:error.message},{status:503});}
      const {error}=await ctx.admin.from('secure_requests').update({status:'submitted',encrypted_payload:encrypted.ciphertext,payload_iv:encrypted.iv,payload_tag:encrypted.tag,submitted_at:new Date().toISOString()}).eq('id',target.id);if(error)throw error; await guestAudit(ctx,'guest.secure_request_submitted','Guest submitted encrypted access information',{requestId:target.id});
    } else return NextResponse.json({error:'unknown_action'},{status:400});
    const refreshed=await payloadFor(token); if(refreshed.error)return NextResponse.json({error:refreshed.error},{status:refreshed.status}); return NextResponse.json(refreshed.body);
  } catch(error){ return NextResponse.json({error:'guest_action_failed',detail:error.message},{status:500}); }
}
