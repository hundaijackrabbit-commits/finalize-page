import { NextResponse } from 'next/server';
import { requireAuthContext } from '../../../../lib/repository/finalizations';
import { loadPrivacySettings } from '../../../../lib/privacy/policy';

function sumPii(artifacts = []) { const totals={}; for(const artifact of artifacts) for(const [key,value] of Object.entries(artifact.pii_summary||{})) totals[key]=(totals[key]||0)+Number(value||0); return totals; }
function impossibleId(){return '00000000-0000-0000-0000-000000000000';}

export async function GET() {
  const ctx=await requireAuthContext(); if(ctx.error)return NextResponse.json({error:ctx.error},{status:ctx.status});
  try {
    const finalsRes=await ctx.db.from('finalizations').select('id,title,state,privacy_closeout_status,finalized_at').eq('organization_id',ctx.organization.id);
    if(finalsRes.error)throw finalsRes.error;
    const finals=finalsRes.data||[]; const ids=finals.map((f)=>f.id); const scopedIds=ids.length?ids:[impossibleId()];
    const [settings,artifactsRes,grantsRes,secureRes,closeoutRes,disposalRes,eventsRes]=await Promise.all([
      loadPrivacySettings(ctx.db,ctx.organization.id),
      ctx.db.from('artifacts').select('id,finalization_id,original_filename,status,privacy_classification,pii_summary,safe_for_ai,ai_blocked_reason,retention_delete_after,created_at').eq('organization_id',ctx.organization.id).order('created_at',{ascending:false}),
      ctx.db.from('guest_access_grants').select('id,finalization_id,participant_id,expires_at,revoked_at,created_at,finalization_participants(display_name,email)').in('finalization_id',scopedIds).is('revoked_at',null).gt('expires_at',new Date().toISOString()),
      ctx.db.from('secure_requests').select('id,finalization_id,title,status,expires_at,submitted_at,destroyed_at').in('finalization_id',scopedIds),
      ctx.db.from('privacy_closeout_items').select('id,finalization_id,title,item_type,status,required,created_at').in('finalization_id',scopedIds),
      ctx.db.from('privacy_disposal_requests').select('*').eq('organization_id',ctx.organization.id).order('created_at',{ascending:false}).limit(50),
      ctx.db.from('privacy_events').select('*').eq('organization_id',ctx.organization.id).order('created_at',{ascending:false}).limit(50),
    ]);
    for(const r of [artifactsRes,grantsRes,secureRes,closeoutRes,disposalRes,eventsRes])if(r.error)throw r.error;
    const artifacts=artifactsRes.data||[]; const privacyCounts=artifacts.reduce((m,a)=>{const k=a.privacy_classification||'BUSINESS';m[k]=(m[k]||0)+1;return m;},{});
    const aiBlocked=artifacts.filter((a)=>a.status==='READY'&&!a.safe_for_ai).length; const closeoutOpen=(closeoutRes.data||[]).filter((i)=>i.required&&!['resolved','waived','scheduled'].includes(i.status)).length; const activeGuests=grantsRes.data||[]; const liveSecrets=(secureRes.data||[]).filter((r)=>['submitted','viewed'].includes(r.status)); const finalized=finals.filter((f)=>f.state==='FINALIZED'); const privacyFinalized=finalized.filter((f)=>f.privacy_closeout_status==='COMPLETE').length; const risk=Math.min(100,activeGuests.length*5+liveSecrets.length*12+closeoutOpen*6+aiBlocked*2); const postureScore=Math.max(0,100-risk);
    return NextResponse.json({settings,posture:{score:postureScore,activeGuests:activeGuests.length,liveSecrets:liveSecrets.length,openCloseoutItems:closeoutOpen,aiBlocked,finalized:finalized.length,privacyFinalized},inventory:{totalArtifacts:artifacts.length,privacyCounts,piiTotals:sumPii(artifacts),artifacts:artifacts.slice(0,80)},guestAccess:activeGuests,secureRequests:secureRes.data||[],closeoutItems:closeoutRes.data||[],disposalRequests:disposalRes.data||[],events:eventsRes.data||[],finalizations:finals});
  } catch(error){return NextResponse.json({error:'privacy_overview_failed',detail:error.message},{status:500});}
}
