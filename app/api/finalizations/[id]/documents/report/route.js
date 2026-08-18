import { NextResponse } from 'next/server';
import { requireAuthContext } from '../../../../../../lib/repository/finalizations';
import { analyzePackageProfiles } from '../../../../../../lib/documents/package';

export async function GET(_request,{params}){
  const ctx=await requireAuthContext();if(ctx.error)return NextResponse.json({error:ctx.error},{status:ctx.status});
  const {id}=await params;
  const {data:fin,error:finError}=await ctx.db.from('finalizations').select('id,title,state,artifact_version,updated_at').eq('id',id).eq('organization_id',ctx.organization.id).maybeSingle();if(finError)throw finError;if(!fin)return NextResponse.json({error:'not_found'},{status:404});
  const [{data:artifacts,error:aErr},{data:profiles,error:pErr},{data:findings,error:fErr},{data:refs,error:rErr}]=await Promise.all([
    ctx.db.from('artifacts').select('id,original_filename,status,privacy_classification,source_sha256,document_analysis_status,document_type,document_score,safe_for_ai,ai_blocked_reason').eq('finalization_id',id).neq('status','DELETED'),
    ctx.db.from('document_profiles').select('artifact_id,document_type,spec_key,title,language,score,metrics,structure_json,entities_json,analyzed_at').eq('finalization_id',id),
    ctx.db.from('document_findings').select('id,artifact_id,artifact_version,rule_key,severity,source,title,detail,evidence_json,status,resolved_at,resolution_note').eq('finalization_id',id),
    ctx.db.from('document_references').select('artifact_id,reference_type,reference_label,raw_text,present_in_package').eq('finalization_id',id),
  ]);for(const e of [aErr,pErr,fErr,rErr])if(e)throw e;
  const safeFindings=(findings||[]).map(({evidence_json,...f})=>({...f,evidence:{confidence:evidence_json?.confidence??null,count:evidence_json?.count??null,referenceCount:Array.isArray(evidence_json?.references)?evidence_json.references.length:0,hasSnippet:Boolean(evidence_json?.snippet)}}));
  const packageObservations=analyzePackageProfiles(profiles||[]);
  const report={schema:'finalize.document-report.v1',generatedAt:new Date().toISOString(),finalization:fin,privacyNote:'Report contains document metadata and minimized finding evidence metadata only. It excludes source documents, extracted text, evidence snippets, AI-safe derivatives, secrets, and guest tokens.',artifacts:artifacts||[],profiles:profiles||[],findings:safeFindings,references:refs||[],packageObservations};
  const slug=(fin.title||'finalization').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  return new NextResponse(JSON.stringify(report,null,2),{headers:{'content-type':'application/json; charset=utf-8','content-disposition':`attachment; filename="${slug}-document-report.json"`,'cache-control':'no-store'}});
}
