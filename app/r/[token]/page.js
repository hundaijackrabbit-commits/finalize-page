'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Icon } from '../../../components/icons';
import { readiness, useFinalizeStore } from '../../../lib/finalize-store';
import { uploadGuestRequestedFile } from '../../../lib/guest-upload-client';

const REMOTE_MODE=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function ReviewSurface({finalization,onAnnotate}){
  const [draft,setDraft]=useState(null); const [body,setBody]=useState('');
  function pick(e){const box=e.currentTarget.getBoundingClientRect();setDraft({x:Math.round(((e.clientX-box.left)/box.width)*1000)/10,y:Math.round(((e.clientY-box.top)/box.height)*1000)/10});setBody('');}
  return <section className="guest-review-section"><div className="guest-section-head"><div><span className="page-kicker">Visual review · v{finalization.artifactVersion}</span><h2>Click anywhere to leave precise feedback.</h2></div><span className="status-pill muted">{(finalization.annotations||[]).filter((a)=>a.status==='open').length} open</span></div>
    <div className="review-browser"><div className="review-browser-bar"><i/><i/><i/><span>{finalization.reviewUrl||'Current review target'}</span></div><div className="review-surface" onClick={pick}>
      <div className="review-mock-nav"><b>ACME</b><span>Work&nbsp;&nbsp; Services&nbsp;&nbsp; About</span><em>Start a project</em></div><div className="review-mock-copy"><small>BUILT TO LAUNCH</small><h3>Good work deserves a clean finish.</h3><p>Review the current artifact, leave contextual feedback, and approve only the version you actually saw.</p><button>Explore the project</button></div><div className="review-mock-card"><strong>Ready for launch?</strong><span>Everything important should be proven, not assumed.</span></div>
      {(finalization.annotations||[]).map((a,i)=><button key={a.id} className={`review-pin ${a.status}`} style={{left:`${a.x}%`,top:`${a.y}%`}} title={a.body} onClick={(e)=>e.stopPropagation()}>{i+1}</button>)}
      {draft&&<div className="annotation-pop" style={{left:`${Math.min(72,draft.x)}%`,top:`${Math.min(72,draft.y)}%`}} onClick={(e)=>e.stopPropagation()}><strong>New feedback</strong><textarea autoFocus value={body} onChange={(e)=>setBody(e.target.value)} placeholder="What should change here?"/><div><button onClick={()=>setDraft(null)}>Cancel</button><button className="dark-btn small" onClick={async()=>{if(!body.trim())return;await onAnnotate({...draft,body,targetRef:finalization.reviewUrl||'/'});setDraft(null);}}>Add note</button></div></div>}
    </div></div>
    <div className="guest-annotation-list">{(finalization.annotations||[]).map((a,i)=><div key={a.id} className={a.status==='resolved'?'resolved':''}><span>{i+1}</span><div><strong>{a.status==='resolved'?'Resolved feedback':'Open feedback'}</strong><p>{a.body}</p><small>Artifact v{a.artifactVersion}</small></div></div>)}</div>
  </section>;
}

function GuestFileRequest({request,token,remote,onDemoComplete,onReload}){
  const input=useRef(null);const [progress,setProgress]=useState(0);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  async function handle(file){if(!file)return;setBusy(true);setError('');try{if(remote){await uploadGuestRequestedFile({token,requestId:request.id,file,onProgress:setProgress});await onReload();}else{for(const v of [20,45,70,100]){await new Promise((r)=>setTimeout(r,120));setProgress(v);}await onDemoComplete(request.id);}}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <div className="guest-request-row"><div className="action-symbol">↑</div><div><strong>{request.title}</strong><small>{request.description||`Accepted: ${(request.acceptedExtensions||[]).join(', ')||'project files'}`}</small>{busy&&<div className="guest-mini-progress"><i style={{width:`${progress}%`}}/></div>}{error&&<em className="error-text">{error}</em>}</div>{request.status==='received'?<span className="status-pill finalized">Received</span>:<><input ref={input} hidden type="file" accept={(request.acceptedExtensions||[]).map((x)=>`.${x}`).join(',')} onChange={(e)=>handle(e.target.files?.[0])}/><button className="soft-btn small" disabled={busy} onClick={()=>input.current?.click()}>{busy?`${progress}%`:'Upload securely'}</button></>}</div>;
}

function SecureRequest({request,onSubmit}){
  const [open,setOpen]=useState(false);
  const [username,setUsername]=useState('');
  const [secret,setSecret]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  if(request.status!=='requested') return <div className="guest-request-row">
    <div className="action-symbol lock">✓</div>
    <div><strong>{request.title}</strong><small>Submitted to the encrypted Finalize vault. The reviewer cannot see it from this page.</small></div>
    <span className="status-pill finalized">{request.status}</span>
  </div>;
  async function submit(e){
    e.preventDefault();
    if(!secret) return;
    setBusy(true); setError('');
    try { await onSubmit(request.id,{username,secret}); setOpen(false); setSecret(''); }
    catch(err){ setError(err.message); }
    finally { setBusy(false); }
  }
  return <div className="secure-request-card">
    <div className="guest-request-row">
      <div className="action-symbol lock">⌁</div>
      <div><strong>{request.title}</strong><small>Encrypted before storage. This secret is destroyed during privacy closeout.</small></div>
      <button className="soft-btn small" onClick={()=>setOpen(!open)}>{open?'Cancel':'Provide securely'}</button>
    </div>
    {open&&<form onSubmit={submit} className="vault-form">
      <input value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="Username / account (optional)"/>
      <input value={secret} onChange={(e)=>setSecret(e.target.value)} placeholder="Password, access code, or secret" type="password"/>
      <div><span><Icon name="shield" size={13}/>Encrypted vault submission</span><button className="dark-btn small" disabled={busy}>{busy?'Encrypting…':'Submit securely'}</button></div>
      {error&&<em className="error-text">{error}</em>}
    </form>}
  </div>;
}

function GuestView({token,finalization,reviewer,workspaceName,brand,score,onComplete,onApprove,onComment,onAnnotate,onSecure,onDemoFile,onReload}){
  const [comment,setComment]=useState('');const clientItems=finalization.requirements.filter((r)=>r.ownerId===reviewer?.id&&r.status!=='passed');
  return <main className="guest-page" style={{'--guest-accent':brand?.accent||'#182018'}}><header className="guest-top"><a href="/" className="brand"><span className="brandmark">✓</span>{brand?.name||workspaceName||'finalize'}</a><div className="secure-label"><Icon name="shield" size={15}/>Secure guest review</div></header><div className="guest-shell phase2-guest">
    <div className="guest-intro"><span className="page-kicker">Requested by {workspaceName}</span><h1>{finalization.title}</h1><p>Hi {reviewer?.name?.split(' ')[0]||'there'}. Everything you need to review, supply, pay, and approve is collected here. No account required.</p><div className="guest-meta"><span>{finalization.client}</span><span>Artifact v{finalization.artifactVersion}</span><span>Expires {finalization.shareExpires||'per workspace policy'}</span></div></div>
    <section className="guest-card"><div className="guest-card-head"><div><span className="page-kicker">Your completion desk</span><h2>{clientItems.length+(finalization.fileRequests||[]).filter((r)=>r.status==='requested').length+(finalization.secureRequests||[]).filter((r)=>r.status==='requested').length? 'A few things still need you.':'You’re caught up.'}</h2></div><div className="guest-progress"><strong>{score}%</strong><span>room readiness</span></div></div><div className="guest-actions-list">
      {clientItems.map((r)=><div className="guest-action" key={r.id}><div className="action-symbol">!</div><div><strong>{r.title}</strong><small>{r.evidence||(r.required?'Required before completion':'Recommended')}</small></div>{r.type==='human'?<button className="dark-btn small" onClick={()=>onComplete(r.id)}>Mark complete</button>:<span className="status-pill muted">Owner action</span>}</div>)}
      {(finalization.fileRequests||[]).map((r)=><GuestFileRequest key={r.id} request={r} token={token} remote={REMOTE_MODE} onDemoComplete={onDemoFile} onReload={onReload}/>)}
      {(finalization.secureRequests||[]).map((r)=><SecureRequest key={r.id} request={r} onSubmit={onSecure}/>)}
      {(finalization.paymentGates||[]).map((g)=><div className="guest-request-row" key={g.id}><div className="action-symbol">$</div><div><strong>{g.label}</strong><small>{g.amountCents!=null?new Intl.NumberFormat('en-CA',{style:'currency',currency:g.currency||'CAD'}).format(g.amountCents/100):'Payment completion gate'}</small></div>{g.status==='paid'?<span className="status-pill finalized">Paid</span>:g.paymentUrl?<a className="dark-btn small" href={g.paymentUrl} target="_blank" rel="noreferrer">Pay securely</a>:<span className="status-pill waiting">Awaiting payment</span>}</div>)}
    </div></section>
    <ReviewSurface finalization={finalization} onAnnotate={onAnnotate}/>
    {finalization.approval.status==='pending'&&finalization.approval.reviewerId===reviewer?.id&&<section className="approval-callout"><div className="approval-emblem">✓</div><div><span className="page-kicker">Final approval requested</span><h2>Approve artifact version {finalization.approval.artifactVersion}?</h2><p>Your approval is bound to this exact version. If a new artifact is uploaded, Finalize automatically supersedes this approval.</p></div><button className="finalize-btn" onClick={onApprove}>Approve final version</button></section>}
    {finalization.approval.status==='approved'&&<section className="approved-callout"><span>✓</span><div><strong>Approval recorded for v{finalization.approval.artifactVersion}.</strong><small>The owner can finalize only if that remains the current artifact version.</small></div></section>}
    <section className="guest-note"><h3>Leave a project note</h3><textarea value={comment} onChange={(e)=>setComment(e.target.value)} placeholder="Add context for the project owner…"/><div><button className="soft-btn" onClick={async()=>{if(!comment.trim())return;await onComment(comment);setComment('');}}>Send note</button></div></section>
    <div className="guest-trust"><Icon name="shield"/><div><strong>Your access is limited to this Finalization.</strong><p>Guest grants are scoped, expiring, and stored as hashes. Requested files still pass through quarantine and security/privacy processing. Secure-request values are encrypted and excluded from guest responses.</p></div></div>
  </div></main>;
}

function RemoteGuestReview(){const params=useParams();const [data,setData]=useState(null);const [error,setError]=useState(null);async function load(){const response=await fetch(`/api/review/${params.token}`,{cache:'no-store'});const body=await response.json();if(!response.ok)throw new Error(body.error==='expired'?'This review link has expired.':'This review link is unavailable.');setData(body);return body;}useEffect(()=>{load().catch((e)=>setError(e.message));},[params.token]);async function act(action,payload={}){const response=await fetch(`/api/review/${params.token}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...payload})});const body=await response.json();if(!response.ok)throw new Error(body.detail||body.error||'Action failed');setData(body);return body;}if(error)return <div className="guest-loading">{error}</div>;if(!data)return <div className="guest-loading">Opening secure review…</div>;return <GuestView token={params.token} {...data} onReload={load} onComplete={(requirementId)=>act('complete_requirement',{requirementId})} onApprove={()=>act('approve')} onComment={(body)=>act('comment',{body})} onAnnotate={(payload)=>act('add_annotation',payload)} onSecure={(requestId,fields)=>act('submit_secure_request',{requestId,fields})} onDemoFile={()=>{}}/>;}

function DemoGuestReview(){const params=useParams();const store=useFinalizeStore();const finalization=store.getByToken(params.token);if(!store.hydrated)return <div className="guest-loading">Opening secure review…</div>;if(!finalization)return <div className="guest-loading">This review link is unavailable or expired.</div>;const reviewer=finalization.participants.find((p)=>p.id===finalization.approval.reviewerId)||finalization.participants.find((p)=>p.role==='Client')||finalization.participants[0];return <GuestView token={params.token} finalization={finalization} reviewer={reviewer} workspaceName={store.workspace.name} brand={{name:store.workspace.brandName||store.workspace.name,accent:store.workspace.brandAccent||'#182018'}} score={readiness(finalization).score} onReload={async()=>{}} onComplete={(requirementId)=>store.setRequirementStatus(finalization.id,requirementId,'passed',`Completed by ${reviewer?.name||'guest reviewer'}`)} onApprove={()=>store.approve(finalization.id,reviewer?.id)} onComment={(body)=>store.addComment(finalization.id,body,null,reviewer?.id)} onAnnotate={(payload)=>store.addAnnotation(finalization.id,{...payload,authorId:reviewer?.id})} onSecure={(requestId,fields)=>store.submitSecureRequest(finalization.id,requestId,fields)} onDemoFile={(requestId)=>store.completeFileRequest(finalization.id,requestId)}/>;}
export default function GuestReview(){return REMOTE_MODE?<RemoteGuestReview/>:<DemoGuestReview/>;}
