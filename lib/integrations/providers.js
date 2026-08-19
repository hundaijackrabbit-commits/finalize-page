import crypto from 'node:crypto';

export const PROVIDERS = {
  github: { label:'GitHub', category:'Development', signals:['github.workflow_run','github.check_suite','github.pull_request','github.push'] },
  vercel: { label:'Vercel', category:'Deployment', signals:['vercel.deployment'] },
  stripe: { label:'Stripe', category:'Payment', signals:['stripe.payment','stripe.invoice'] },
  docusign: { label:'E-signature', category:'Signature', signals:['esign.envelope'] },
  google_drive: { label:'Google Drive', category:'Files', signals:['drive.file'] },
  generic: { label:'Generic webhook', category:'Automation', signals:['generic.signal'] },
};

function pick(obj, keys) { const out={}; for(const key of keys) if(obj?.[key] != null) out[key]=obj[key]; return out; }
function cleanText(v,max=500){return String(v??'').slice(0,max);}
function eventId(payload, fallback='event'){ return cleanText(payload?.id || payload?.delivery || payload?.event_id || fallback, 180); }

export function normalizeProviderEvent(provider, payload = {}, headers = {}) {
  const now = new Date().toISOString();
  if (provider === 'github') {
    const kind = cleanText(headers['x-github-event'] || payload.event || 'unknown',80);
    const repo = payload.repository?.full_name || payload.repository?.name || null;
    if (kind === 'workflow_run') {
      const run=payload.workflow_run||{};
      return { provider,eventId:eventId(payload,headers['x-github-delivery']||run.id),signalKey:'github.workflow_run',state:run.conclusion||run.status||payload.action||'unknown',observedAt:run.updated_at||now,evidence:{repository:repo,name:run.name||null,branch:run.head_branch||null,sha:run.head_sha||null,url:run.html_url||null,action:payload.action||null} };
    }
    if (kind === 'check_suite') {
      const check=payload.check_suite||{};
      return { provider,eventId:eventId(payload,headers['x-github-delivery']||check.id),signalKey:'github.check_suite',state:check.conclusion||check.status||payload.action||'unknown',observedAt:check.updated_at||now,evidence:{repository:repo,sha:check.head_sha||null,url:check.url||null,action:payload.action||null} };
    }
    if (kind === 'pull_request') {
      const pr=payload.pull_request||{};
      const state=pr.merged?'merged':payload.action||pr.state||'unknown';
      return { provider,eventId:eventId(payload,headers['x-github-delivery']||pr.id||pr.number),signalKey:'github.pull_request',state,observedAt:pr.updated_at||now,evidence:{repository:repo,number:pr.number||payload.number||null,title:cleanText(pr.title,240)||null,branch:pr.head?.ref||null,sha:pr.head?.sha||null,url:pr.html_url||null} };
    }
    return { provider,eventId:eventId(payload,headers['x-github-delivery']||payload.after),signalKey:'github.push',state:'received',observedAt:payload.head_commit?.timestamp||now,evidence:{repository:repo,ref:payload.ref||null,sha:payload.after||null,compare:payload.compare||null} };
  }
  if (provider === 'stripe') {
    const type=cleanText(payload.type||'unknown',120); const obj=payload.data?.object||{};
    let state='observed'; let signalKey=type.startsWith('invoice.')?'stripe.invoice':'stripe.payment';
    if (['payment_intent.succeeded','checkout.session.completed','invoice.paid'].includes(type)) state='paid';
    else if (['payment_intent.payment_failed','invoice.payment_failed'].includes(type)) state='failed';
    else if (['charge.refunded','refund.updated'].includes(type)) state='refunded';
    return { provider,eventId:eventId(payload,type),signalKey,state,observedAt:payload.created?new Date(payload.created*1000).toISOString():now,evidence:{type,objectId:obj.id||null,amount:obj.amount_received??obj.amount_total??obj.amount_paid??obj.amount??null,currency:obj.currency||null,status:obj.status||null,metadata:pick(obj.metadata||{},['finalization_id','requirement_id','invoice_number'])} };
  }
  if (provider === 'vercel') {
    const type=cleanText(payload.type||payload.event||payload.name||'deployment',120); const data=payload.payload||payload.data||payload;
    const deployment=data.deployment||data;
    const rawState=cleanText(deployment.state||deployment.readyState||deployment.status||type,80).toLowerCase();
    const state=/succeed|ready|success/.test(rawState)?'ready':/fail|error|cancel/.test(rawState)?'failed':rawState||'observed';
    return { provider,eventId:eventId(payload,deployment.id||type),signalKey:'vercel.deployment',state,observedAt:deployment.createdAt?new Date(deployment.createdAt).toISOString():now,evidence:{deploymentId:deployment.id||deployment.uid||null,url:deployment.url||null,projectId:deployment.projectId||data.projectId||null,target:deployment.target||null,rawState} };
  }
  if (provider === 'docusign') {
    const envelope=payload.data?.envelope||payload.envelope||payload;
    const state=cleanText(envelope.status||payload.status||payload.event||'observed',80).toLowerCase();
    return { provider,eventId:eventId(payload,envelope.envelopeId||envelope.id),signalKey:'esign.envelope',state,observedAt:envelope.statusChangedDateTime||now,evidence:{envelopeId:envelope.envelopeId||envelope.id||null,status:state,subject:cleanText(envelope.emailSubject||envelope.subject,240)||null} };
  }
  if (provider === 'google_drive') {
    const file=payload.file||payload.data?.file||payload;
    return { provider,eventId:eventId(payload,file.id),signalKey:'drive.file',state:cleanText(payload.action||payload.state||'updated',80),observedAt:file.modifiedTime||now,evidence:{fileId:file.id||null,name:cleanText(file.name,240)||null,mimeType:file.mimeType||null,version:file.version||null} };
  }
  return { provider:'generic',eventId:eventId(payload,crypto.randomUUID()),signalKey:cleanText(payload.signal_key||'generic.signal',120),state:cleanText(payload.state||'observed',120),observedAt:payload.observed_at||now,evidence:pick(payload.evidence||{},['reference','url','version','sha','amount','currency','status']) };
}

export function matchesBinding(binding, event) {
  if (binding.signal_key !== event.signalKey) return false;
  const matcher=binding.matcher_json||{}; const ev=event.evidence||{};
  for(const [key,value] of Object.entries(matcher)) {
    if(value==null||value==='') continue;
    if(String(ev[key]??'').toLowerCase()!==String(value).toLowerCase()) return false;
  }
  return true;
}

export function verifyHmac(rawBody, provided, secret, prefix='sha256=') {
  if(!secret || !provided) return false;
  const expected=prefix+crypto.createHmac('sha256',secret).update(rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(provided)); } catch { return false; }
}

export function verifyStripeSignature(rawBody, signature, secret, toleranceSeconds=300) {
  if(!secret||!signature)return false;
  const parts=Object.fromEntries(signature.split(',').map((p)=>p.split('=').map((x)=>x.trim())));
  const timestamp=Number(parts.t); const v1=parts.v1;
  if(!timestamp||!v1||Math.abs(Date.now()/1000-timestamp)>toleranceSeconds)return false;
  const expected=crypto.createHmac('sha256',secret).update(`${timestamp}.${rawBody}`).digest('hex');
  try{return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(v1));}catch{return false;}
}
