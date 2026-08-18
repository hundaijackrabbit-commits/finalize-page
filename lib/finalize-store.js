'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { INITIAL_FINALIZATIONS, WORKSPACE, createBlankFinalization } from './demo-data';
import { PHASE2_TEMPLATES } from './phase2-templates';

const STORAGE_KEY = 'finalize.phase2.v1';
const REMOTE_MODE = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function cloneSeed() { return JSON.parse(JSON.stringify(INITIAL_FINALIZATIONS)); }
function loadState() {
  if (typeof window === 'undefined') return cloneSeed();
  try { const raw = window.localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : cloneSeed(); } catch { return cloneSeed(); }
}
function ownerName(finalization, ownerId) { return finalization.participants.find((p) => p.id === ownerId)?.name || 'Unassigned'; }
function synthetic(id, title, category, source, status = 'open') { return { id, title, category, source, required: true, status, synthetic: true }; }

export function completionSignals(finalization) {
  const signals = [];
  for (const r of finalization.requirements || []) if (r.required && r.status !== 'passed' && r.status !== 'waived') signals.push({ ...r, source: 'requirement' });
  for (const r of finalization.fileRequests || []) if (r.required && !['received','waived'].includes(r.status)) signals.push(synthetic(`file:${r.id}`, r.title, 'File request', 'file_request'));
  for (const r of finalization.secureRequests || []) if (!['submitted','viewed','destroyed'].includes(r.status)) signals.push(synthetic(`secure:${r.id}`, r.title, 'Secure access', 'secure_request'));
  for (const g of finalization.paymentGates || []) if (!['paid','waived'].includes(g.status)) signals.push(synthetic(`payment:${g.id}`, g.label, 'Payment', 'payment'));
  for (const i of finalization.privacyItems || []) if (i.required && !['resolved','waived','scheduled'].includes(i.status)) signals.push(synthetic(`privacy:${i.id}`, i.title, 'Privacy', 'privacy'));
  for (const a of finalization.annotations || []) if (a.artifactVersion === finalization.artifactVersion && a.status === 'open') signals.push(synthetic(`review:${a.id}`, 'Unresolved review feedback', 'Review', 'review'));
  return signals;
}

export function blockerGraph(finalization) {
  const open = completionSignals(finalization);
  const reqById = new Map((finalization.requirements || []).map((r) => [r.id, r]));
  const groups = new Map();
  for (const item of open) {
    let root = item;
    const seen = new Set();
    while (root?.dependsOnId && reqById.has(root.dependsOnId) && !seen.has(root.dependsOnId)) {
      seen.add(root.dependsOnId);
      root = reqById.get(root.dependsOnId);
    }
    const key = root?.id || item.id;
    if (!groups.has(key)) groups.set(key, { root: root || item, blocked: [] });
    if (item.id !== key) groups.get(key).blocked.push(item);
  }
  return [...groups.values()].sort((a,b) => b.blocked.length - a.blocked.length);
}

export function readiness(finalization) {
  const requirements = finalization.requirements || [];
  const required = requirements.filter((r) => r.required);
  const recommended = requirements.filter((r) => !r.required);
  const passedRequired = required.filter((r) => ['passed','waived'].includes(r.status)).length;
  const passedRecommended = recommended.filter((r) => ['passed','waived'].includes(r.status)).length;
  const externalTotal = (finalization.fileRequests || []).filter((r) => r.required).length + (finalization.secureRequests || []).length + (finalization.paymentGates || []).length + (finalization.privacyItems || []).filter((i) => i.required).length + (finalization.annotations || []).filter((a) => a.artifactVersion === finalization.artifactVersion).length;
  const externalOpen = completionSignals(finalization).filter((b) => b.source !== 'requirement').length;
  const denominator = Math.max(required.length * 2 + recommended.length + externalTotal * 2, 1);
  const numerator = passedRequired * 2 + passedRecommended + Math.max(0, externalTotal - externalOpen) * 2;
  const score = Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
  const blockers = completionSignals(finalization);
  const warnings = recommended.filter((r) => !['passed','waived'].includes(r.status));
  const readyForApproval = blockers.length === 0;
  const approvalMatchesVersion = finalization.approval?.status === 'approved' && finalization.approval?.artifactVersion === finalization.artifactVersion;
  const readyToFinalize = readyForApproval && approvalMatchesVersion;
  return { score, blockers, warnings, required, passedRequired, readyForApproval, readyToFinalize, approvalMatchesVersion, rootBlockers: blockerGraph(finalization) };
}

export function useFinalizeStore() {
  const [workspace, setWorkspace] = useState(WORKSPACE);
  const [finalizations, setFinalizations] = useState(() => REMOTE_MODE ? [] : cloneSeed());
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState(null);

  const replaceOne = useCallback((item) => setFinalizations((items) => items.some((f) => f.id === item.id) ? items.map((f) => f.id === item.id ? item : f) : [item, ...items]), []);
  const refresh = useCallback(async () => {
    if (!REMOTE_MODE) return;
    const response = await fetch('/api/finalizations', { cache: 'no-store' });
    if (response.status === 401) { window.location.href = '/login'; return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || 'Could not load workspace');
    setWorkspace(data.workspace); setFinalizations(data.finalizations); return data;
  }, []);
  const remoteAction = useCallback(async (id, action, payload = {}) => {
    const response = await fetch(`/api/finalizations/${id}/actions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || 'Action failed');
    if (data.finalization) replaceOne({ ...data.finalization, ...(data.guest ? { shareToken: data.guest.token, shareExpires: data.guest.expiresAt } : {}) });
    return data;
  }, [replaceOne]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!REMOTE_MODE) { setFinalizations(loadState()); setHydrated(true); return; }
      try { if (!cancelled) await refresh(); } catch (e) { if (!cancelled) setError(e.message); } finally { if (!cancelled) setHydrated(true); }
    })();
    return () => { cancelled = true; };
  }, [refresh]);
  useEffect(() => { if (!REMOTE_MODE && hydrated) try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(finalizations)); } catch {} }, [finalizations, hydrated]);

  const mutate = useCallback((id, updater) => setFinalizations((items) => items.map((f) => f.id === id ? updater(f) : f)), []);
  const audit = (text, kind = 'change', actor = WORKSPACE.currentUser.name) => ({ id:`a_${Math.random()}`, kind, text, actor, time:'Just now' });

  const setRequirementStatus = useCallback(async (finalizationId, requirementId, status, evidence = null) => {
    if (REMOTE_MODE) return remoteAction(finalizationId, 'set_requirement_status', { requirementId, status, evidence });
    mutate(finalizationId, (f) => { const req=f.requirements.find((r)=>r.id===requirementId); return { ...f, state:f.state==='FINALIZED'?'FINALIZED':'RESOLVING', updatedAt:'Just now', requirements:f.requirements.map((r)=>r.id===requirementId?{...r,status,evidence:evidence??r.evidence,lastChecked:'Just now'}:r), activity:[audit(`${req?.title || 'Requirement'} ${status==='passed'?'completed':'updated'}`,status==='passed'?'pass':'change'),...f.activity] }; });
  }, [mutate, remoteAction]);

  const recheckRequirement = useCallback(async (finalizationId, requirementId) => {
    if (REMOTE_MODE) return remoteAction(finalizationId, 'recheck_requirement', { requirementId });
    await setRequirementStatus(finalizationId, requirementId, 'checking', 'Automated re-check running…');
    window.setTimeout(() => mutate(finalizationId, (f) => ({ ...f, state:'RESOLVING', requirements:f.requirements.map((r)=>r.id===requirementId?{...r,status:'passed',evidence:'Automated re-check passed',lastChecked:'Just now'}:r), activity:[audit(`${f.requirements.find((r)=>r.id===requirementId)?.title || 'Automated check'} passed re-check`,'pass','Finalize'),...f.activity] })), 900);
  }, [mutate, remoteAction, setRequirementStatus]);

  const addParticipant = useCallback(async (finalizationId, payload) => {
    if (REMOTE_MODE) return remoteAction(finalizationId, 'add_participant', payload);
    mutate(finalizationId, (f) => { const id=`gst_${Math.random().toString(36).slice(2,9)}`; const name=payload.name.trim(); const p={id,name,email:payload.email||null,initials:name.split(/\s+/).slice(0,2).map((x)=>x[0]?.toUpperCase()).join(''),role:payload.role||'Reviewer'}; return {...f,participants:[...f.participants,p],approval:payload.asReviewer===false?f.approval:{...f.approval,reviewerId:id,status:'not_requested',requestedAt:null,approvedAt:null},activity:[audit(`${name} added as ${p.role}`),...f.activity]}; });
  }, [mutate, remoteAction]);

  const addRequirement = useCallback(async (finalizationId, payload) => {
    if (REMOTE_MODE) return remoteAction(finalizationId, 'add_requirement', payload);
    mutate(finalizationId, (f) => ({...f,state:f.state==='DRAFT'?'BLOCKED':f.state,requirements:[...f.requirements,{id:`req_${Math.random().toString(36).slice(2,9)}`,title:payload.title,category:payload.category||'Closeout',type:payload.type||'human',severity:payload.required===false?'warning':'blocker',required:payload.required!==false,ownerId:payload.ownerId||WORKSPACE.currentUser.id,status:'open',evidence:null,lastChecked:null,dependsOnId:payload.dependsOnId||null,resolutionAction:payload.resolutionAction||null}],activity:[audit(`Requirement added: ${payload.title}`),...f.activity]}));
  }, [mutate, remoteAction]);

  const addComment = useCallback(async (finalizationId, body, requirementId = null, authorId = WORKSPACE.currentUser.id) => {
    if (!body.trim()) return; if (REMOTE_MODE) return remoteAction(finalizationId,'add_comment',{body,requirementId});
    mutate(finalizationId,(f)=>{const author=f.participants.find((p)=>p.id===authorId)||WORKSPACE.currentUser;return{...f,comments:[{id:`c_${Math.random()}`,authorId:author.id,body:body.trim(),createdAt:'Just now',requirementId},...f.comments],activity:[audit(`${author.name} added a comment`,'comment',author.name),...f.activity]};});
  },[mutate,remoteAction]);

  const addAnnotation = useCallback(async (finalizationId, payload) => {
    if (REMOTE_MODE) return remoteAction(finalizationId,'add_annotation',payload);
    mutate(finalizationId,(f)=>({...f,annotations:[{id:`ann_${Math.random().toString(36).slice(2,8)}`,artifactVersion:f.artifactVersion,targetType:payload.targetType||'website',targetRef:payload.targetRef||'/',x:payload.x,y:payload.y,body:payload.body,visibility:payload.visibility||(payload.authorId&&payload.authorId!==WORKSPACE.currentUser.id?'shared':'internal'),status:'open',authorId:payload.authorId||WORKSPACE.currentUser.id,createdAt:'Just now'},...(f.annotations||[])],state:'RESOLVING',activity:[audit('Review annotation added','comment'),...f.activity]}));
  },[mutate,remoteAction]);

  const resolveAnnotation = useCallback(async (finalizationId, annotationId) => {
    if (REMOTE_MODE) return remoteAction(finalizationId,'resolve_annotation',{annotationId});
    mutate(finalizationId,(f)=>({...f,annotations:(f.annotations||[]).map((a)=>a.id===annotationId?{...a,status:'resolved'}:a),activity:[audit('Review feedback resolved','pass'),...f.activity]}));
  },[mutate,remoteAction]);

  const addFileRequest = useCallback(async (finalizationId,payload)=>{
    if(REMOTE_MODE)return remoteAction(finalizationId,'add_file_request',payload);
    mutate(finalizationId,(f)=>({...f,fileRequests:[...(f.fileRequests||[]),{id:`fr_${Math.random().toString(36).slice(2,8)}`,title:payload.title,description:payload.description||'',acceptedExtensions:payload.acceptedExtensions||[],required:payload.required!==false,participantId:payload.participantId||f.approval.reviewerId,status:'requested'}],activity:[audit(`File requested: ${payload.title}`),...f.activity]}));
  },[mutate,remoteAction]);

  const completeFileRequest = useCallback(async(finalizationId,requestId)=>{ if(REMOTE_MODE)return remoteAction(finalizationId,'complete_file_request',{requestId}); mutate(finalizationId,(f)=>({...f,fileRequests:(f.fileRequests||[]).map((r)=>r.id===requestId?{...r,status:'received',completedAt:'Just now'}:r),activity:[audit('Requested file received','pass'),...f.activity]})); },[mutate,remoteAction]);

  const addSecureRequest = useCallback(async(finalizationId,payload)=>{ if(REMOTE_MODE)return remoteAction(finalizationId,'add_secure_request',payload); mutate(finalizationId,(f)=>({...f,secureRequests:[...(f.secureRequests||[]),{id:`sec_${Math.random().toString(36).slice(2,8)}`,title:payload.title,requestType:payload.requestType||'credential',participantId:payload.participantId||f.approval.reviewerId,status:'requested',expiresAt:'7 days'}],activity:[audit(`Secure request created: ${payload.title}`),...f.activity]})); },[mutate,remoteAction]);
  const submitSecureRequest = useCallback(async(finalizationId,requestId,fields)=>{ if(REMOTE_MODE)throw new Error('Guest secure submissions must use the guest review route.'); mutate(finalizationId,(f)=>({...f,secureRequests:(f.secureRequests||[]).map((r)=>r.id===requestId?{...r,status:'submitted',submittedAt:'Just now'}:r),activity:[audit('Secure credential submitted','pass','Client'),...f.activity]})); return fields; },[mutate]);
  const destroySecureRequest = useCallback(async(finalizationId,requestId)=>{ if(REMOTE_MODE)return remoteAction(finalizationId,'destroy_secure_request',{requestId}); mutate(finalizationId,(f)=>({...f,secureRequests:(f.secureRequests||[]).map((r)=>r.id===requestId?{...r,status:'destroyed',destroyedAt:'Just now'}:r),privacyItems:(f.privacyItems||[]).map((i)=>i.itemType==='credential'?{...i,status:'resolved',resolvedAt:'Just now'}:i),activity:[audit('Vault secret destroyed','pass'),...f.activity]})); },[mutate,remoteAction]);

  const createPaymentGate = useCallback(async(finalizationId,payload)=>{ if(REMOTE_MODE)return remoteAction(finalizationId,'create_payment_gate',payload); mutate(finalizationId,(f)=>({...f,paymentGates:[...(f.paymentGates||[]),{id:`pay_${Math.random().toString(36).slice(2,8)}`,label:payload.label||'Final payment',amountCents:payload.amountCents??null,currency:payload.currency||'CAD',provider:'manual',providerReference:payload.reference||null,paymentUrl:payload.paymentUrl||null,status:'unpaid',paidAt:null}],activity:[audit(`Payment gate created: ${payload.label||'Final payment'}`),...f.activity]})); },[mutate,remoteAction]);
  const addPrivacyItem = useCallback(async(finalizationId,payload)=>{ if(REMOTE_MODE)return remoteAction(finalizationId,'add_privacy_item',payload); mutate(finalizationId,(f)=>({...f,privacyItems:[...(f.privacyItems||[]),{id:`priv_${Math.random().toString(36).slice(2,8)}`,itemType:payload.itemType||'other',title:payload.title,description:payload.description||'',required:payload.required!==false,status:'open'}],activity:[audit(`Privacy closeout item added: ${payload.title}`),...f.activity]})); },[mutate,remoteAction]);

  const setPaymentStatus = useCallback(async(finalizationId,paymentId,status)=>{ if(REMOTE_MODE)return remoteAction(finalizationId,'set_payment_status',{paymentId,status}); mutate(finalizationId,(f)=>({...f,paymentGates:(f.paymentGates||[]).map((g)=>g.id===paymentId?{...g,status,paidAt:status==='paid'?'Just now':g.paidAt}:g),requirements:f.requirements.map((r)=>r.category==='Payment'&&r.required?{...r,status:status==='paid'?'passed':r.status,evidence:status==='paid'?'Payment received':r.evidence}:r),activity:[audit(status==='paid'?'Payment received':'Payment status updated',status==='paid'?'pass':'change'),...f.activity]})); },[mutate,remoteAction]);

  const setPrivacyItemStatus = useCallback(async(finalizationId,itemId,status)=>{ if(REMOTE_MODE)return remoteAction(finalizationId,'set_privacy_item_status',{itemId,status}); mutate(finalizationId,(f)=>({...f,privacyItems:(f.privacyItems||[]).map((i)=>i.id===itemId?{...i,status,resolvedAt:status==='resolved'?'Just now':i.resolvedAt}:i),activity:[audit(`Privacy closeout ${status}` ,status==='resolved'?'pass':'change'),...f.activity]})); },[mutate,remoteAction]);

  const sendReminder = useCallback(async(finalizationId,participantId)=>{ if(REMOTE_MODE)return remoteAction(finalizationId,'send_reminder',{participantId}); mutate(finalizationId,(f)=>({...f,reminders:[{id:`rem_${Math.random().toString(36).slice(2,8)}`,participantId,channel:'email',subject:`Items still needed to finalize ${f.title}`,status:'sent',sendAt:'Just now',sentAt:'Just now'},...(f.reminders||[])],activity:[audit('Client reminder sent'),...f.activity]})); },[mutate,remoteAction]);

  const requestApproval = useCallback(async(finalizationId)=>{ if(REMOTE_MODE)return remoteAction(finalizationId,'request_approval'); mutate(finalizationId,(f)=>{if(!readiness(f).readyForApproval)return f;const reviewer=ownerName(f,f.approval.reviewerId);return{...f,state:'READY',approval:{...f.approval,status:'pending',requestedAt:'Just now',approvedAt:null,artifactVersion:f.artifactVersion},activity:[audit(`Final approval requested from ${reviewer}`,'approval'),...f.activity]};}); },[mutate,remoteAction]);
  const approve = useCallback(async(finalizationId,actorId)=>{ if(REMOTE_MODE)return remoteAction(finalizationId,'approve'); mutate(finalizationId,(f)=>{if(f.approval.status!=='pending')return f;const actor=f.participants.find((p)=>p.id===actorId)||{name:'Guest reviewer'};return{...f,state:'READY',approval:{...f.approval,status:'approved',approvedAt:'Just now',artifactVersion:f.artifactVersion},activity:[audit(`Final approval received from ${actor.name}`,'approval',actor.name),...f.activity]};}); },[mutate,remoteAction]);
  const finalize = useCallback(async(finalizationId)=>{ if(REMOTE_MODE)return remoteAction(finalizationId,'finalize'); mutate(finalizationId,(f)=>{const info=readiness(f);if(!info.readyToFinalize)return f;return{...f,state:'FINALIZED',privacyCloseoutStatus:'COMPLETE',handoffStatus:f.handoffStatus==='NOT_STARTED'?'COMPLETE':f.handoffStatus,record:{id:`F-${Math.floor(1000+Math.random()*9000)}`,finalizedAt:'Just now',artifactVersion:f.artifactVersion,fingerprint:`SHA256: ${Math.random().toString(16).slice(2,6)}…${Math.random().toString(16).slice(2,6)}`,passedCount:f.requirements.filter((r)=>['passed','waived'].includes(r.status)).length},activity:[audit('Finalization completed and record sealed','finalize'),...f.activity]};}); },[mutate,remoteAction]);

  const createFinalization = useCallback(async(payload)=>{
    if(!REMOTE_MODE){ let item=createBlankFinalization(payload); const template=PHASE2_TEMPLATES.find((t)=>t.key===payload.templateKey); if(template){ item={...item,type:template.name,templateKey:template.key,requirements:template.requirements.map((r,i)=>({id:`req_${Math.random().toString(36).slice(2,8)}`,title:r[0],category:r[1],type:r[2],required:r[3],severity:r[3]?'blocker':'warning',ownerId:WORKSPACE.currentUser.id,status:'open',evidence:null,lastChecked:null,position:i}))}; } setFinalizations((items)=>[item,...items]); return item; }
    const response=await fetch('/api/finalizations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}); const data=await response.json(); if(!response.ok)throw new Error(data.detail||data.error||'Could not create Finalization'); replaceOne(data.finalization); return data.finalization;
  },[replaceOne]);

  const createGuestLink = useCallback(async(finalizationId,participantId)=>{ if(!REMOTE_MODE)return finalizations.find((f)=>f.id===finalizationId)?.shareToken||null; const data=await remoteAction(finalizationId,'create_guest_link',{participantId}); return data.guest?.token||null; },[finalizations,remoteAction]);
  const updateBranding = useCallback(async(payload)=>{ if(!REMOTE_MODE){setWorkspace((w)=>({...w,brandName:payload.brandName||w.name,brandAccent:payload.brandAccent||'#182018',customDomain:payload.customDomain||null}));return;} const response=await fetch('/api/workspace/branding',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.detail||data.error||'Could not update branding');setWorkspace((w)=>({...w,...data.workspace,currentUser:w.currentUser}));return data.workspace; },[]);
  const updateReviewUrl = useCallback(async(finalizationId,reviewUrl)=>{ if(REMOTE_MODE)return remoteAction(finalizationId,'update_review_url',{reviewUrl}); mutate(finalizationId,(f)=>({...f,reviewUrl})); },[mutate,remoteAction]);
  const bumpDemoVersion = useCallback((finalizationId)=>mutate(finalizationId,(f)=>({...f,artifactVersion:f.artifactVersion+1,approval:{...f.approval,status:'superseded',approvedAt:null,requestedAt:null,artifactVersion:f.artifactVersion},versions:[{id:`ver_${f.artifactVersion+1}`,versionNumber:f.artifactVersion+1,artifactId:null,reason:'simulated_artifact_upload',createdAt:'Just now'},...(f.versions||[])],activity:[audit(`Artifact changed to v${f.artifactVersion+1}; prior approval invalidated`,'change','Finalize'),...f.activity]})),[mutate]);

  const resetDemo=useCallback(()=>!REMOTE_MODE&&setFinalizations(cloneSeed()),[]);
  const getById=useCallback((id)=>finalizations.find((f)=>f.id===id||f.slug===id),[finalizations]);
  const getByToken=useCallback((token)=>finalizations.find((f)=>f.shareToken===token),[finalizations]);

  return useMemo(()=>({workspace,finalizations,templates:PHASE2_TEMPLATES,hydrated,error,remoteMode:REMOTE_MODE,refresh,getById,getByToken,addParticipant,setRequirementStatus,recheckRequirement,addRequirement,addComment,addAnnotation,resolveAnnotation,addFileRequest,completeFileRequest,addSecureRequest,submitSecureRequest,destroySecureRequest,createPaymentGate,addPrivacyItem,setPaymentStatus,setPrivacyItemStatus,sendReminder,requestApproval,approve,finalize,createFinalization,createGuestLink,updateBranding,updateReviewUrl,bumpDemoVersion,resetDemo}),[workspace,finalizations,hydrated,error,refresh,getById,getByToken,addParticipant,setRequirementStatus,recheckRequirement,addRequirement,addComment,addAnnotation,resolveAnnotation,addFileRequest,completeFileRequest,addSecureRequest,submitSecureRequest,destroySecureRequest,createPaymentGate,addPrivacyItem,setPaymentStatus,setPrivacyItemStatus,sendReminder,requestApproval,approve,finalize,createFinalization,createGuestLink,updateBranding,updateReviewUrl,bumpDemoVersion,resetDemo]);
}
