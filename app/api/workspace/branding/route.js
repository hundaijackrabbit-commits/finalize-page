import { NextResponse } from 'next/server';
import { requireAuthContext } from '../../../../lib/repository/finalizations';

function validHex(value){return /^#[0-9a-fA-F]{6}$/.test(value||'');}
function cleanDomain(value){const raw=String(value||'').trim().toLowerCase();if(!raw)return null;if(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(raw))throw new Error('invalid_custom_domain');return raw;}

export async function POST(request){
  const ctx=await requireAuthContext();if(ctx.error)return NextResponse.json({error:ctx.error},{status:ctx.status});
  if(!['owner','admin'].includes(ctx.membership.role))return NextResponse.json({error:'admin_required'},{status:403});
  try{const body=await request.json();const brandName=String(body.brandName||ctx.organization.name).trim().slice(0,120);const brandAccent=validHex(body.brandAccent)?body.brandAccent:'#182018';const customDomain=cleanDomain(body.customDomain);const {data,error}=await ctx.db.from('organizations').update({brand_name:brandName||null,brand_accent:brandAccent,custom_domain:customDomain}).eq('id',ctx.organization.id).select('id,name,plan,brand_name,brand_accent,brand_logo_url,custom_domain').single();if(error)throw error;return NextResponse.json({workspace:{id:data.id,name:data.name,brandName:data.brand_name||data.name,brandAccent:data.brand_accent||'#182018',brandLogoUrl:data.brand_logo_url||null,customDomain:data.custom_domain||null,plan:data.plan}});}catch(error){return NextResponse.json({error:error.message==='invalid_custom_domain'?'invalid_custom_domain':'branding_update_failed',detail:error.message},{status:400});}
}
