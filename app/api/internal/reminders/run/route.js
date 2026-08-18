import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../../../lib/supabase/admin';

export async function POST(request){
  const auth=request.headers.get('authorization')||'';const worker=process.env.FINALIZE_WORKER_SECRET;if(!worker||auth!==`Bearer ${worker}`)return NextResponse.json({error:'unauthorized'},{status:401});
  const endpoint=process.env.FINALIZE_EMAIL_WEBHOOK_URL;const emailSecret=process.env.FINALIZE_EMAIL_WEBHOOK_SECRET;if(!endpoint||!emailSecret)return NextResponse.json({error:'email_delivery_not_configured'},{status:503});
  const db=createSupabaseAdminClient();const {data:due,error}=await db.from('reminders').select('id,finalization_id,participant_id,subject,finalization_participants!inner(email,display_name),finalizations!inner(title,counterpart_name)').eq('status','scheduled').lte('send_at',new Date().toISOString()).limit(25);if(error)return NextResponse.json({error:'query_failed',detail:error.message},{status:500});
  const results=[];for(const r of due||[]){const email=r.finalization_participants?.email;if(!email){await db.from('reminders').update({status:'failed'}).eq('id',r.id);results.push({id:r.id,status:'failed',reason:'missing_email'});continue;}try{const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${emailSecret}`},body:JSON.stringify({to:email,name:r.finalization_participants.display_name,subject:r.subject,finalizationId:r.finalization_id,finalizationTitle:r.finalizations?.title})});if(!response.ok)throw new Error(`delivery ${response.status}`);await db.from('reminders').update({status:'sent',sent_at:new Date().toISOString()}).eq('id',r.id);results.push({id:r.id,status:'sent'});}catch(error){await db.from('reminders').update({status:'failed'}).eq('id',r.id);results.push({id:r.id,status:'failed',reason:error.message});}}
  return NextResponse.json({processed:results.length,results});
}
