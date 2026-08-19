import crypto from 'node:crypto';
import { matchesBinding, normalizeProviderEvent } from './providers';

export async function ingestIntegrationEvent({ db, organizationId, connection, provider, rawBody, payload, headers={}, signatureValid=false }) {
  const normalized=normalizeProviderEvent(provider,payload,headers);
  const rawSha256=crypto.createHash('sha256').update(rawBody).digest('hex');
  const eventInsert={organization_id:organizationId,connection_id:connection?.id||null,provider,provider_event_id:normalized.eventId||null,signal_key:normalized.signalKey,observed_state:normalized.state,normalized_event_json:{evidence:normalized.evidence,observedAt:normalized.observedAt},raw_sha256:rawSha256,signature_valid:signatureValid,received_at:new Date().toISOString()};
  if(connection?.id && normalized.eventId){const {data:existing,error:existingError}=await db.from('integration_events').select('id').eq('connection_id',connection.id).eq('provider_event_id',normalized.eventId).limit(1).maybeSingle();if(existingError)throw existingError;if(existing)return {normalized,matched:0,deduplicated:true};}
  const {data:event,error:eventError}=await db.from('integration_events').upsert(eventInsert,{onConflict:'connection_id,provider_event_id',ignoreDuplicates:true}).select().maybeSingle();
  if(eventError)throw eventError;
  const eventRow=event|| (await db.from('integration_events').select('*').eq('connection_id',connection?.id||null).eq('provider_event_id',normalized.eventId).maybeSingle()).data;
  if(!connection)return {normalized,matched:0};
  const {data:bindings,error:bindingError}=await db.from('integration_bindings').select('*').eq('organization_id',organizationId).eq('connection_id',connection.id).neq('status','paused');
  if(bindingError)throw bindingError;
  let matched=0;
  for(const binding of bindings||[]) {
    if(!matchesBinding(binding,normalized))continue;
    matched++;
    const passed=String(normalized.state).toLowerCase()===String(binding.expected_state).toLowerCase();
    const evidenceStatus=passed?'PASS':'FAIL';
    const summary=`${connection.display_name}: ${normalized.signalKey} observed “${normalized.state}”${passed?' — expected state satisfied':' — expected “'+binding.expected_state+'”'}`;
    const {data:evidence,error:evidenceError}=await db.from('external_evidence').insert({organization_id:organizationId,finalization_id:binding.finalization_id,requirement_id:binding.requirement_id,binding_id:binding.id,event_id:eventRow?.id||null,provider,evidence_status:evidenceStatus,summary,evidence_json:{signalKey:normalized.signalKey,state:normalized.state,...normalized.evidence},observed_at:normalized.observedAt}).select().single();
    if(evidenceError)throw evidenceError;
    await db.from('integration_bindings').update({status:passed?'satisfied':'failed',last_observed_state:normalized.state,last_observed_at:normalized.observedAt,updated_at:new Date().toISOString()}).eq('id',binding.id);
    if(binding.requirement_id){await db.from('requirements').update({status:passed?'passed':'open',evidence_summary:summary,evidence_json:{externalEvidenceId:evidence.id,provider,signalKey:normalized.signalKey,state:normalized.state},last_checked_at:normalized.observedAt,updated_at:new Date().toISOString()}).eq('id',binding.requirement_id).eq('finalization_id',binding.finalization_id);}
    const {data:fin}=await db.from('finalizations').select('state,artifact_version').eq('id',binding.finalization_id).maybeSingle();
    if(!passed){await db.from('approvals').update({status:'superseded',approved_at:null,requested_at:null}).eq('finalization_id',binding.finalization_id).in('status',['pending','approved']);}
    if(!passed && fin?.state==='FINALIZED'){
      await db.from('finalization_records').update({record_status:'superseded'}).eq('finalization_id',binding.finalization_id).eq('record_status','active');
      await db.from('approvals').update({status:'superseded',approved_at:null}).eq('finalization_id',binding.finalization_id);
      await db.from('finalizations').update({state:'REOPENED',finalized_at:null,updated_at:new Date().toISOString()}).eq('id',binding.finalization_id);
    } else if(!passed){await db.from('finalizations').update({state:'RESOLVING',updated_at:new Date().toISOString()}).eq('id',binding.finalization_id).neq('state','FINALIZED');}
    await db.from('audit_events').insert({organization_id:organizationId,finalization_id:binding.finalization_id,event_type:passed?'integration.evidence_passed':'integration.evidence_failed',event_data:{text:summary,actor:'Finalize Integration Engine',provider,externalEvidenceId:evidence.id}});
  }
  await db.from('integration_connections').update({status:'connected',last_synced_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq('id',connection.id);
  return {normalized,matched};
}
