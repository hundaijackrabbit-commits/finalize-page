import { NextResponse } from 'next/server';
import { requireAuthContext } from '../../../../lib/repository/finalizations';
import { loadPrivacySettings } from '../../../../lib/privacy/policy';

export async function GET(){
  const ctx=await requireAuthContext();if(ctx.error)return NextResponse.json({error:ctx.error},{status:ctx.status});
  if(!['owner','admin'].includes(ctx.membership.role))return NextResponse.json({error:'admin_required'},{status:403});
  try{
    const {data:finals,error:fErr}=await ctx.db.from('finalizations').select('id').eq('organization_id',ctx.organization.id);if(fErr)throw fErr;const ids=(finals||[]).map((f)=>f.id);const scoped=ids.length?ids:['00000000-0000-0000-0000-000000000000'];
    const [settings,artifacts,grants,disposal,events]=await Promise.all([
      loadPrivacySettings(ctx.db,ctx.organization.id),
      ctx.db.from('artifacts').select('id,finalization_id,original_filename,status,privacy_classification,source_sha256,pii_summary,safe_for_ai,ai_blocked_reason,retention_delete_after,created_at').eq('organization_id',ctx.organization.id),
      ctx.db.from('guest_access_grants').select('id,finalization_id,participant_id,expires_at,revoked_at,created_at').in('finalization_id',scoped),
      ctx.db.from('privacy_disposal_requests').select('id,finalization_id,artifact_id,request_type,status,reason,execute_after,completed_at,created_at').eq('organization_id',ctx.organization.id),
      ctx.db.from('privacy_events').select('event_type,event_data,created_at').eq('organization_id',ctx.organization.id).order('created_at',{ascending:false}).limit(500),
    ]);for(const r of [artifacts,grants,disposal,events])if(r.error)throw r.error;
    const manifest={schema:'finalize.privacy.export.v1',generatedAt:new Date().toISOString(),organization:{id:ctx.organization.id,name:ctx.organization.name},policy:settings,artifacts:artifacts.data||[],guestAccess:grants.data||[],disposalRequests:disposal.data||[],privacyEvents:events.data||[],exclusions:['encrypted credential payloads','guest token values','raw artifact contents','redaction derivatives']};
    return new NextResponse(JSON.stringify(manifest,null,2),{headers:{'content-type':'application/json; charset=utf-8','content-disposition':`attachment; filename="finalize-privacy-export-${new Date().toISOString().slice(0,10)}.json"`,'cache-control':'no-store'}});
  }catch(error){return NextResponse.json({error:'privacy_export_failed',detail:error.message},{status:500});}
}
