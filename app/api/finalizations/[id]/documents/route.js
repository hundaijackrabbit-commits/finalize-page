import { NextResponse } from 'next/server';
import { getFinalization, requireAuthContext, writeAudit } from '../../../../../lib/repository/finalizations';
import { JOBS } from '../../../../../lib/processing/queue';

const TYPES=new Set(['GENERIC','CONTRACT','PROPOSAL','APPLICATION','REPORT']);

async function requireArtifact(ctx,finalizationId,artifactId){
  const {data,error}=await ctx.db.from('artifacts').select('*').eq('id',artifactId).eq('finalization_id',finalizationId).eq('organization_id',ctx.organization.id).maybeSingle();
  if(error)throw error; return data;
}

async function queueAnalysis(ctx,artifact){
  if(!artifact.extracted_text_key) throw new Error('artifact_has_no_text_derivative');
  const row={organization_id:artifact.organization_id,finalization_id:artifact.finalization_id,artifact_id:artifact.id,job_type:JOBS.DOCUMENT_ANALYSIS,status:'QUEUED',priority:90,attempts:0,max_attempts:4,available_at:new Date().toISOString(),lease_until:null,worker_id:null,input:{requestedBy:ctx.user.id},output:{},last_error:null,completed_at:null,dead_lettered_at:null,updated_at:new Date().toISOString()};
  const {error}=await ctx.db.from('processing_jobs').upsert(row,{onConflict:'artifact_id,job_type'}); if(error)throw error;
  const {error:updateError}=await ctx.db.from('artifacts').update({document_analysis_status:'QUEUED',updated_at:new Date().toISOString()}).eq('id',artifact.id);if(updateError)throw updateError;
}

export async function POST(request,{params}){
  const ctx=await requireAuthContext(); if(ctx.error)return NextResponse.json({error:ctx.error},{status:ctx.status});
  const {id}=await params; const current=await getFinalization(ctx,id); if(!current)return NextResponse.json({error:'not_found'},{status:404});
  try{
    const body=await request.json(); const action=body.action;
    if(action==='reanalyze_artifact'){
      const artifact=await requireArtifact(ctx,id,body.artifactId); if(!artifact)return NextResponse.json({error:'artifact_not_found'},{status:404});
      await queueAnalysis(ctx,artifact); await writeAudit(ctx,id,'document.analysis_queued',`Document analysis queued for ${artifact.original_filename}`,{artifactId:artifact.id});
    } else if(action==='reanalyze_package'){
      const {data,error}=await ctx.db.from('artifacts').select('*').eq('organization_id',ctx.organization.id).eq('finalization_id',id).neq('status','DELETED');if(error)throw error;
      const eligible=(data||[]).filter(a=>a.extracted_text_key); for(const artifact of eligible)await queueAnalysis(ctx,artifact);
      await writeAudit(ctx,id,'document.package_analysis_queued',`Document package analysis queued for ${eligible.length} artifact(s)`,{count:eligible.length});
    } else if(action==='set_document_type'){
      const type=String(body.documentType||'').toUpperCase(); if(!TYPES.has(type))return NextResponse.json({error:'invalid_document_type'},{status:400});
      const artifact=await requireArtifact(ctx,id,body.artifactId); if(!artifact)return NextResponse.json({error:'artifact_not_found'},{status:404});
      const {error}=await ctx.db.from('artifacts').update({document_type_override:type,document_analysis_status:'QUEUED',updated_at:new Date().toISOString()}).eq('id',artifact.id);if(error)throw error;
      const {data:nextVersion,error:versionError}=await ctx.db.rpc('bump_finalize_artifact_version',{p_finalization_id:id,p_organization_id:ctx.organization.id});if(versionError)throw versionError;
      const {error:historyError}=await ctx.db.from('finalization_versions').upsert({finalization_id:id,version_number:nextVersion,artifact_id:artifact.id,reason:'document_type_override',created_by:ctx.user.id},{onConflict:'finalization_id,version_number'});if(historyError)throw historyError;
      await queueAnalysis(ctx,{...artifact,document_type_override:type}); await writeAudit(ctx,id,'document.type_overridden',`${artifact.original_filename} classified as ${type}; approval invalidated for v${nextVersion}`,{artifactId:artifact.id,documentType:type,artifactVersion:nextVersion});
    } else if(action==='confirm_finding_blocker'){
      const {data:finding,error:findError}=await ctx.db.from('document_findings').select('id,title,artifact_id,source,severity').eq('id',body.findingId).eq('finalization_id',id).eq('organization_id',ctx.organization.id).maybeSingle();if(findError)throw findError;if(!finding)return NextResponse.json({error:'finding_not_found'},{status:404});
      const note=String(body.note||'Human reviewer confirmed this finding should block completion.').trim().slice(0,1200);
      const {error}=await ctx.db.from('document_findings').update({severity:'BLOCKER',source:'HUMAN',status:'OPEN',resolved_by:null,resolved_at:null,resolution_note:note,updated_at:new Date().toISOString()}).eq('id',finding.id);if(error)throw error;
      await writeAudit(ctx,id,'document.finding_confirmed_blocker',`Human-confirmed blocker: ${finding.title}`,{findingId:finding.id,artifactId:finding.artifact_id,previousSource:finding.source,previousSeverity:finding.severity});
    } else if(action==='set_finding_status'){
      const status=['OPEN','RESOLVED','WAIVED'].includes(body.status)?body.status:null; if(!status)return NextResponse.json({error:'invalid_status'},{status:400});
      const note=String(body.note||'').trim().slice(0,1200)||null;
      const {data:finding,error:findError}=await ctx.db.from('document_findings').select('id,title,artifact_id').eq('id',body.findingId).eq('finalization_id',id).eq('organization_id',ctx.organization.id).maybeSingle();if(findError)throw findError;if(!finding)return NextResponse.json({error:'finding_not_found'},{status:404});
      const {error}=await ctx.db.from('document_findings').update({status,resolved_by:status==='OPEN'?null:ctx.user.id,resolved_at:status==='OPEN'?null:new Date().toISOString(),resolution_note:note,updated_at:new Date().toISOString()}).eq('id',finding.id);if(error)throw error;
      await writeAudit(ctx,id,status==='WAIVED'?'document.finding_waived':status==='RESOLVED'?'document.finding_resolved':'document.finding_reopened',`${status.toLowerCase()}: ${finding.title}`,{findingId:finding.id,artifactId:finding.artifact_id,note});
    } else return NextResponse.json({error:'unknown_action'},{status:400});
    return NextResponse.json({finalization:await getFinalization(ctx,id)});
  }catch(error){return NextResponse.json({error:'document_action_failed',detail:error.message},{status:500});}
}
