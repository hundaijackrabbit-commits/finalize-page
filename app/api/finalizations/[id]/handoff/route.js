import { NextResponse } from 'next/server';
import { getFinalization, requireAuthContext, writeAudit } from '../../../../../lib/repository/finalizations';
import { analyzePackageProfiles } from '../../../../../lib/documents/package';

function safeFilename(value){return String(value||'finalization').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'finalization';}

export async function GET(_request,{params}){
  const ctx=await requireAuthContext(); if(ctx.error)return NextResponse.json({error:ctx.error},{status:ctx.status}); const {id}=await params;
  try{
    const f=await getFinalization(ctx,id); if(!f)return NextResponse.json({error:'not_found'},{status:404});
    const packageObservations=analyzePackageProfiles((f.artifacts||[]).filter(a=>a.documentProfile).map(a=>({...a.documentProfile,artifactId:a.id})));
    const manifest={
      schema:'finalize.handoff.v1', generatedAt:new Date().toISOString(), finalization:{id:f.id,title:f.title,type:f.type,counterpart:f.client,state:f.state,artifactVersion:f.artifactVersion,templateKey:f.templateKey||null},
      definitionOfDone:f.requirements.map((r)=>({id:r.id,title:r.title,category:r.category,type:r.type,required:r.required,status:r.status,evidence:r.evidence||null,lastChecked:r.lastChecked||null})),
      review:{currentVersion:f.artifactVersion,openAnnotations:(f.annotations||[]).filter((a)=>a.artifactVersion===f.artifactVersion&&a.status==='open').length,approval:{title:f.approval.title,status:f.approval.status,artifactVersion:f.approval.artifactVersion,requestedAt:f.approval.requestedAt,approvedAt:f.approval.approvedAt}},
      artifacts:(f.artifacts||[]).filter((a)=>a.status==='READY').map((a)=>({name:a.name,sizeBytes:a.size,mimeType:a.mimeType,privacy:a.privacy,sha256:a.sourceSha256||null,safeForAi:a.safeForAi,document:{status:a.documentAnalysisStatus,type:a.documentProfile?.documentType||a.documentType||null,specKey:a.documentProfile?.specKey||null,score:a.documentProfile?.score??a.documentScore??null,findings:(a.documentFindings||[]).map((d)=>({ruleKey:d.ruleKey,severity:d.severity,title:d.title,status:d.status,artifactVersion:d.artifactVersion??null,resolutionNote:d.resolutionNote||null})),references:(a.documentReferences||[]).map((r)=>({type:r.type,label:r.label,present:r.present}))}})),
      documentPackage:{observations:packageObservations,openBlockers:(f.artifacts||[]).flatMap((a)=>a.documentFindings||[]).filter((d)=>d.severity==='BLOCKER'&&d.status==='OPEN').length,openWarnings:(f.artifacts||[]).flatMap((a)=>a.documentFindings||[]).filter((d)=>d.severity==='WARNING'&&d.status==='OPEN').length},
      clientRequests:{files:(f.fileRequests||[]).map((r)=>({title:r.title,status:r.status,completedAt:r.completedAt||null})),secure:(f.secureRequests||[]).map((r)=>({title:r.title,type:r.requestType,status:r.status,submittedAt:r.submittedAt||null,destroyedAt:r.destroyedAt||null}))},
      payments:(f.paymentGates||[]).map((g)=>({label:g.label,amountCents:g.amountCents,currency:g.currency,status:g.status,paidAt:g.paidAt||null,reference:g.providerReference||null})),
      privacyCloseout:(f.privacyItems||[]).map((i)=>({type:i.itemType,title:i.title,required:i.required,status:i.status,resolvedAt:i.resolvedAt||null})),
      finalizationRecord:f.record||null,
      notes:['Encrypted credential payloads are intentionally excluded.','This manifest describes state at generation time; the sealed Finalization Record is authoritative after completion.'],
    };
    await ctx.db.from('finalizations').update({handoff_status:'GENERATED',updated_at:new Date().toISOString()}).eq('id',id).eq('organization_id',ctx.organization.id);
    await writeAudit(ctx,id,'handoff.manifest_generated','Handoff manifest generated');
    return new NextResponse(JSON.stringify(manifest,null,2),{status:200,headers:{'content-type':'application/json; charset=utf-8','content-disposition':`attachment; filename="${safeFilename(f.title)}-finalize-handoff.json"`,'cache-control':'no-store'}});
  }catch(error){return NextResponse.json({error:'handoff_failed',detail:error.message},{status:500});}
}
