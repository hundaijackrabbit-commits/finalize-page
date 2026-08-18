import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../../lib/supabase/admin';

function safeEqual(a,b){const aa=Buffer.from(String(a||''));const bb=Buffer.from(String(b||''));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
export async function POST(request){
  const secret=process.env.FINALIZE_PAYMENT_WEBHOOK_SECRET;if(!secret)return NextResponse.json({error:'webhook_not_configured'},{status:503});
  const raw=await request.text();const signature=request.headers.get('x-finalize-signature')||'';const expected=crypto.createHmac('sha256',secret).update(raw).digest('hex');if(!safeEqual(signature,expected))return NextResponse.json({error:'invalid_signature'},{status:401});
  try{const event=JSON.parse(raw);const reference=String(event.reference||'').slice(0,240);if(!reference)return NextResponse.json({error:'reference_required'},{status:400});const db=createSupabaseAdminClient();const {data:gate,error}=await db.from('payment_gates').select('id,finalization_id,status').eq('provider_reference',reference).maybeSingle();if(error)throw error;if(!gate)return NextResponse.json({error:'payment_gate_not_found'},{status:404});const status=event.status==='paid'?'paid':event.status==='refunded'?'refunded':'pending';await db.from('payment_gates').update({status,paid_at:status==='paid'?(event.paidAt||new Date().toISOString()):null,updated_at:new Date().toISOString()}).eq('id',gate.id);if(status==='paid')await db.from('requirements').update({status:'passed',evidence_summary:`Payment event ${reference}`,last_checked_at:new Date().toISOString()}).eq('finalization_id',gate.finalization_id).eq('category','Payment').eq('required',true);return NextResponse.json({ok:true,status});}catch(error){return NextResponse.json({error:'payment_webhook_failed',detail:error.message},{status:500});}
}
