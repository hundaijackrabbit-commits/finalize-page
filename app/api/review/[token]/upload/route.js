import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, HeadObjectCommand, UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { resolveGuestGrant } from '../../../../../lib/repository/guest';
import { getS3, uploadBucket } from '../../../../../lib/uploads/s3';
import { s3Configured } from '../../../../../lib/runtime';
import { seedArtifactPipeline } from '../../../../../lib/processing/queue';
import { calculateRetentionDate, loadPrivacySettings } from '../../../../../lib/privacy/policy';

const PART_SIZE=8*1024*1024; const MAX_SIZE=5*1024*1024*1024;
const MIME=new Map([['pdf','application/pdf'],['docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],['xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],['pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation'],['txt','text/plain'],['md','text/markdown'],['csv','text/csv'],['json','application/json'],['png','image/png'],['jpg','image/jpeg'],['jpeg','image/jpeg'],['webp','image/webp'],['zip','application/zip']]);
function safeName(name){return String(name||'').normalize('NFKC').replace(/[\\/\0]/g,'-').replace(/[^a-zA-Z0-9._ -]/g,'_').replace(/\s+/g,' ').trim().slice(0,180)||'upload.bin';}
function ext(name){return name.split('.').pop()?.toLowerCase()||'';}
async function audit(ctx,type,text,data={}){await ctx.admin.from('audit_events').insert({organization_id:ctx.row.organization_id,finalization_id:ctx.row.id,actor_participant_id:ctx.grant.participant_id,event_type:type,event_data:{text,actor:'Guest reviewer',...data}});}

export async function POST(request,{params}){
  const {token}=await params; if(!s3Configured())return NextResponse.json({error:'storage_not_configured'},{status:503});
  try{
    const ctx=await resolveGuestGrant(token); if(ctx.error)return NextResponse.json({error:ctx.error},{status:ctx.status});
    const body=await request.json(); const action=body.action; const s3=getS3(); const Bucket=uploadBucket();
    if(action==='start'){
      const fileRequest=ctx.row.file_requests?.find((r)=>r.id===body.requestId);
      if(!fileRequest||fileRequest.participant_id!==ctx.grant.participant_id||fileRequest.status!=='requested')return NextResponse.json({error:'file_request_unavailable'},{status:403});
      const filename=safeName(body.filename); const extension=ext(filename); const expected=MIME.get(extension); const accepted=(fileRequest.accepted_extensions||[]).map((x)=>String(x).replace(/^\./,'').toLowerCase());
      if(!expected|| (accepted.length&&!accepted.includes(extension)))return NextResponse.json({error:'file_type_not_allowed',allowed:accepted},{status:415});
      const size=Number(body.size||0); if(!Number.isSafeInteger(size)||size<=0||size>MAX_SIZE)return NextResponse.json({error:'invalid_file_size',maxBytes:MAX_SIZE},{status:413});
      const artifactId=crypto.randomUUID(); const Key=`${ctx.row.organization_id}/${ctx.row.id}/${artifactId}/${crypto.randomUUID()}-${filename}`;
      const created=await s3.send(new CreateMultipartUploadCommand({Bucket,Key,ContentType:expected,ServerSideEncryption:'AES256',ChecksumAlgorithm:'SHA256',Metadata:{'artifact-id':artifactId,'finalization-id':ctx.row.id,'guest-upload':'true'}}));
      const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
      const privacySettings=await loadPrivacySettings(ctx.admin,ctx.row.organization_id);const retentionDeleteAfter=calculateRetentionDate(privacySettings.sourceRetentionDays);const {error:aErr}=await ctx.admin.from('artifacts').insert({id:artifactId,organization_id:ctx.row.organization_id,finalization_id:ctx.row.id,original_filename:filename,storage_key:Key,size_bytes:size,mime_type:expected,status:'UPLOADING',privacy_classification:'CONFIDENTIAL',retention_delete_after:retentionDeleteAfter,created_by:null,created_by_participant_id:ctx.grant.participant_id});
      if(aErr){await s3.send(new AbortMultipartUploadCommand({Bucket,Key,UploadId:created.UploadId})).catch(()=>{});throw aErr;}
      const {error:sErr}=await ctx.admin.from('upload_sessions').insert({organization_id:ctx.row.organization_id,finalization_id:ctx.row.id,artifact_id:artifactId,provider_upload_id:created.UploadId,part_size_bytes:PART_SIZE,status:'UPLOADING',expires_at:expiresAt,created_by:null,created_by_participant_id:ctx.grant.participant_id,file_request_id:fileRequest.id});if(sErr)throw sErr;
      await audit(ctx,'guest_upload.started',`Guest upload started: ${filename}`,{artifactId,fileRequestId:fileRequest.id}); return NextResponse.json({artifactId,partSize:PART_SIZE,expiresAt});
    }
    const artifactId=String(body.artifactId||'');
    const {data:session,error:sessionError}=await ctx.admin.from('upload_sessions').select('*,artifacts(*)').eq('artifact_id',artifactId).eq('finalization_id',ctx.row.id).eq('created_by_participant_id',ctx.grant.participant_id).maybeSingle();
    if(sessionError)throw sessionError; if(!session||session.status==='ABORTED'||new Date(session.expires_at)<=new Date())return NextResponse.json({error:'upload_session_unavailable'},{status:410});
    const Key=session.artifacts.storage_key; const UploadId=session.provider_upload_id;
    if(action==='sign_part'){
      const partNumber=Number(body.partNumber);const checksum=String(body.checksum||'');if(!Number.isInteger(partNumber)||partNumber<1||partNumber>10000||!checksum)return NextResponse.json({error:'invalid_part'},{status:400});
      const url=await getSignedUrl(s3,new UploadPartCommand({Bucket,Key,UploadId,PartNumber:partNumber,ChecksumSHA256:checksum}),{expiresIn:15*60}); return NextResponse.json({url,partNumber});
    }
    if(action==='complete'){
      const parts=Array.isArray(body.parts)?body.parts:[];if(!parts.length)return NextResponse.json({error:'parts_required'},{status:400});
      await ctx.admin.from('upload_sessions').update({status:'COMPLETING',updated_at:new Date().toISOString()}).eq('artifact_id',artifactId);
      const completed=await s3.send(new CompleteMultipartUploadCommand({Bucket,Key,UploadId,MultipartUpload:{Parts:parts.map((p)=>({ETag:p.etag,PartNumber:Number(p.partNumber),ChecksumSHA256:p.checksum}))}}));
      const head=await s3.send(new HeadObjectCommand({Bucket,Key,ChecksumMode:'ENABLED'})); if(Number(head.ContentLength)!==Number(session.artifacts.size_bytes)){await ctx.admin.from('artifacts').update({status:'REJECTED',processing_error:'Uploaded object length mismatch'}).eq('id',artifactId);throw new Error('Object size integrity check failed');}
      const integrity=completed.ChecksumSHA256||head.ChecksumSHA256||null;
      await ctx.admin.from('artifacts').update({status:'QUARANTINED',integrity_checksum:integrity,malware_scan_status:'PENDING',updated_at:new Date().toISOString()}).eq('id',artifactId);
      await ctx.admin.from('upload_sessions').update({status:'COMPLETE',updated_at:new Date().toISOString()}).eq('artifact_id',artifactId);
      await ctx.admin.from('file_requests').update({status:'received',artifact_id:artifactId,completed_at:new Date().toISOString()}).eq('id',session.file_request_id).eq('finalization_id',ctx.row.id);
      await seedArtifactPipeline(ctx.admin,{...session.artifacts,status:'QUARANTINED'});
      const {data:nextVersion,error:versionError}=await ctx.admin.rpc('bump_finalize_artifact_version',{p_finalization_id:ctx.row.id,p_organization_id:ctx.row.organization_id});if(versionError)throw versionError;
      await ctx.admin.from('finalization_versions').upsert({finalization_id:ctx.row.id,version_number:nextVersion,artifact_id:artifactId,reason:'guest_file_received',created_by_participant_id:ctx.grant.participant_id},{onConflict:'finalization_id,version_number'});
      await audit(ctx,'guest_upload.completed',`Requested file received and quarantined: ${session.artifacts.original_filename}`,{artifactId,fileRequestId:session.file_request_id,artifactVersion:nextVersion});
      return NextResponse.json({artifactId,status:'QUARANTINED',integrityChecksum:integrity,artifactVersion:nextVersion,approvalInvalidated:true});
    }
    if(action==='abort'){
      await s3.send(new AbortMultipartUploadCommand({Bucket,Key,UploadId})).catch(()=>{});await ctx.admin.from('upload_sessions').update({status:'ABORTED'}).eq('artifact_id',artifactId);await ctx.admin.from('artifacts').update({status:'FAILED',processing_error:'Upload aborted by guest'}).eq('id',artifactId);return NextResponse.json({ok:true});
    }
    return NextResponse.json({error:'unknown_action'},{status:400});
  }catch(error){return NextResponse.json({error:'guest_upload_failed',detail:error.message},{status:500});}
}
