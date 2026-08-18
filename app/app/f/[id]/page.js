'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '../../../../components/app-shell';
import { Icon } from '../../../../components/icons';
import { ArtifactUpload } from '../../../../components/artifact-upload';
import { readiness, useFinalizeStore } from '../../../../lib/finalize-store';
import { ClientDeskPanel, CloseoutPanel, ReviewPanel, RootBlockerGraph } from '../../../../components/phase2-room';
import { PrivacyRoomPanel } from '../../../../components/privacy-center';

function RequirementRow({ item, finalization, store, onComment }) {
  const owner = finalization.participants.find((p) => p.id === item.ownerId);
  const comments = finalization.comments.filter((c) => c.requirementId === item.id);
  return <div className={`requirement-card ${item.status}`}>
    <button className="req-check" onClick={() => item.status !== 'checking' && store.setRequirementStatus(finalization.id, item.id, item.status === 'passed' ? 'open' : 'passed')} aria-label="Toggle requirement">
      {item.status === 'passed' ? '✓' : item.status === 'checking' ? <span className="spinner"/> : ''}
    </button>
    <div className="req-body">
      <div className="req-topline"><strong>{item.title}</strong><span className={`severity ${item.required ? 'required' : 'recommended'}`}>{item.required ? 'Required' : 'Recommended'}</span></div>
      <div className="req-meta"><span>{item.category}</span><span>·</span><span>{item.type === 'automated' ? 'Automated check' : item.type === 'integration' ? 'Integration' : 'Human gate'}</span>{item.evidence && <><span>·</span><span className="evidence-inline">{item.evidence}</span></>}</div>
      {comments.length > 0 && <div className="mini-comments">{comments.slice(0,2).map((c) => { const author = finalization.participants.find((p) => p.id === c.authorId); return <div key={c.id}><span className="tiny-avatar">{author?.initials || '?'}</span><span>{c.body}</span></div>; })}</div>}
    </div>
    <div className="req-owner"><span className="tiny-avatar">{owner?.initials || '?'}</span><span>{owner?.name || 'Unassigned'}</span></div>
    <div className="req-actions">
      {item.type === 'automated' && <button className="icon-btn text" onClick={() => store.recheckRequirement(finalization.id, item.id)} disabled={item.status === 'checking'}><Icon name="refresh" size={15}/>{item.status === 'checking' ? 'Checking' : 'Re-check'}</button>}
      <button className="icon-btn" onClick={() => onComment(item.id)} title="Comment"><Icon name="message" size={16}/></button>
    </div>
  </div>;
}

function AddRequirement({ finalization, store }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [required, setRequired] = useState(true);
  const [ownerId, setOwnerId] = useState(finalization.participants[0]?.id || '');
  function submit(e) { e.preventDefault(); if (!title.trim()) return; store.addRequirement(finalization.id, { title: title.trim(), required, ownerId }); setTitle(''); setOpen(false); }
  if (!open) return <button className="add-requirement" onClick={() => setOpen(true)}><Icon name="plus" size={16}/>Add requirement</button>;
  return <form className="inline-add" onSubmit={submit}><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What must be true before this is done?"/><select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>{finalization.participants.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select><label><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)}/>Required</label><button className="dark-btn small">Add</button><button className="soft-btn small" type="button" onClick={() => setOpen(false)}>Cancel</button></form>;
}

function CommentComposer({ finalization, store, requirementId, onClose }) {
  const [body, setBody] = useState('');
  return <div className="comment-composer"><div><strong>Add a comment</strong><button onClick={onClose}>×</button></div><textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add context, ask a question, or leave a handoff note…"/><div className="composer-actions"><button className="soft-btn small" onClick={onClose}>Cancel</button><button className="dark-btn small" onClick={() => { store.addComment(finalization.id, body, requirementId); onClose(); }}>Comment</button></div></div>;
}

function ReviewerManager({ finalization, store }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  if (!open) return <button className="soft-btn small reviewer-add" onClick={() => setOpen(true)}><Icon name="plus" size={14}/>Add or change reviewer</button>;
  return <form className="reviewer-form" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await store.addParticipant(finalization.id, { name: name.trim(), email: email.trim(), role: 'Client reviewer', asReviewer: true }); setOpen(false); setName(''); setEmail(''); }}>
    <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Reviewer name"/>
    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="reviewer@client.com"/>
    <button className="dark-btn small" type="submit">Set reviewer</button><button className="soft-btn small" type="button" onClick={() => setOpen(false)}>Cancel</button>
  </form>;
}

export default function FinalizationRoom() {
  const params = useParams();
  const store = useFinalizeStore();
  const [tab, setTab] = useState('Requirements');
  const [commentFor, setCommentFor] = useState(null);
  const [copied, setCopied] = useState(false);
  const [guestToken, setGuestToken] = useState('');
  const finalization = store.getById(params.id);
  const info = useMemo(() => finalization ? readiness(finalization) : null, [finalization]);
  useEffect(() => { if (finalization?.shareToken) setGuestToken(finalization.shareToken); }, [finalization?.shareToken]);

  if (!store.hydrated) return <div className="loading-screen">Loading Finalize Room…</div>;
  if (!finalization) return <div className="loading-screen">Finalization not found. <a href="/app">Back to workspace</a></div>;

  const reviewer = finalization.participants.find((p) => p.id === finalization.approval.reviewerId);
  const sharePath = guestToken ? `/r/${guestToken}` : null;
  async function ensureGuestLink() {
    if (guestToken) return guestToken;
    const token = await store.createGuestLink(finalization.id, reviewer?.id);
    if (token) setGuestToken(token);
    return token;
  }
  async function copyShare() {
    const token = await ensureGuestLink();
    if (!token) return;
    const url = `${window.location.origin}/r/${token}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { window.prompt('Copy guest review link', url); }
  }
  async function openGuest() {
    const token = await ensureGuestLink();
    if (token) window.open(`/r/${token}`, '_blank', 'noopener,noreferrer');
  }

  return <AppShell workspace={store.workspace} finalizations={store.finalizations} activeId={finalization.id}>
    <div className="room-header-v2">
      <div><div className="breadcrumbs"><a href="/app">Active</a><span>/</span><span>{finalization.type}</span></div><h1>{finalization.title}</h1><div className="room-meta"><span>{finalization.client}</span><span>Due {finalization.dueLabel}</span><span>Artifact v{finalization.artifactVersion}</span><span>{finalization.participants.length} participants</span></div></div>
      <div className="head-actions"><button className="soft-btn" onClick={copyShare}><Icon name="link" size={16}/>{copied ? 'Copied' : guestToken ? 'Copy review link' : 'Create review link'}</button><button className="dark-btn" onClick={openGuest}><Icon name="external" size={15}/>Open guest view</button></div>
    </div>

    <div className="readiness-card">
      <div className="score-ring" style={{'--score': `${info.score * 3.6}deg`}}><div><strong>{info.score}</strong><span>Readiness</span></div></div>
      <div className="readiness-copy">
        <span className="page-kicker">Finalize gate</span>
        <h2>{finalization.state === 'FINALIZED' ? 'Finalized and sealed.' : info.blockers.length ? `${info.blockers.length} blocker${info.blockers.length === 1 ? '' : 's'} still prevent completion.` : finalization.approval.status === 'approved' ? 'Approved. Ready to finalize.' : finalization.approval.status === 'pending' ? `Waiting for ${reviewer?.name || 'reviewer'}.` : 'All required conditions pass.'}</h2>
        <p>{finalization.state === 'FINALIZED' ? `Record ${finalization.record?.id} preserves the completion state for artifact version ${finalization.record?.artifactVersion}.` : info.blockers.length ? 'Resolve every required condition before Finalize will allow the final approval request.' : 'The requirements are clear. The room can now move through final approval without guessing what “done” means.'}</p>
      </div>
      <div className="gate-summary"><div><span>Required passed</span><strong>{info.passedRequired}/{info.required.length}</strong></div><div><span>Warnings</span><strong>{info.warnings.length}</strong></div><div><span>Approval</span><strong>{finalization.approval.status.replace('_',' ')}</strong></div></div>
    </div>

    <div className="room-tabs">{['Requirements','Review','Client Desk','Files','Privacy','Approvals','Closeout','Discussion','Activity'].map((t) => <button key={t} onClick={() => setTab(t)} className={tab === t ? 'active' : ''}>{t}{t === 'Discussion' && finalization.comments.length > 0 && <span>{finalization.comments.length}</span>}</button>)}</div>

    {tab === 'Requirements' && <>
      <div className="section-bar"><div><h3>Definition of done</h3><p>Required blockers control the gate. Recommendations improve readiness without preventing completion.</p></div><div className="legend"><span><i className="dot-required"/>Required</span><span><i className="dot-recommended"/>Recommended</span></div></div>
      <RootBlockerGraph info={info}/>
      <div className="requirements-stack">
        {finalization.requirements.map((item) => <RequirementRow key={item.id} item={item} finalization={finalization} store={store} onComment={setCommentFor}/>) }
      </div>
      <AddRequirement finalization={finalization} store={store}/>
      {commentFor && <CommentComposer finalization={finalization} store={store} requirementId={commentFor} onClose={() => setCommentFor(null)}/>} 
    </>}

    {tab === 'Review' && <ReviewPanel finalization={finalization} store={store}/>}

    {tab === 'Client Desk' && <ClientDeskPanel finalization={finalization} store={store} copyShare={copyShare}/>}

    {tab === 'Files' && <ArtifactUpload finalization={finalization} store={store}/>}

    {tab === 'Privacy' && <PrivacyRoomPanel finalization={finalization} store={store}/>}

    {tab === 'Closeout' && <CloseoutPanel finalization={finalization} store={store}/>}

    {tab === 'Approvals' && <div className="two-col-panels">
      <section className="detail-panel"><span className="page-kicker">Final approval</span><h3>{finalization.approval.title}</h3><p>Approval is bound to artifact version {finalization.approval.artifactVersion}. Current artifact: v{finalization.artifactVersion}. New artifact uploads automatically supersede pending or approved reviews of an older version.</p>{finalization.approval.artifactVersion !== finalization.artifactVersion && <div className="version-alert"><strong>Version changed.</strong><span>Approval v{finalization.approval.artifactVersion} does not authorize v{finalization.artifactVersion}.</span></div>}<div className="approval-person"><span className="person-avatar">{reviewer?.initials || '?'}</span><div><strong>{reviewer?.name || 'Reviewer'}</strong><small>{reviewer?.role || 'Reviewer'}</small></div><span className={`status-pill ${finalization.approval.status === 'approved' ? 'finalized' : finalization.approval.status === 'pending' ? 'waiting' : 'muted'}`}>{finalization.approval.status.replace('_',' ')}</span></div><ReviewerManager finalization={finalization} store={store}/></section>
      <section className="detail-panel"><span className="page-kicker">Guest access</span><h3>Secure review link</h3><p>Reviewers can act on their assigned requirements without joining your workspace. Production links are hashed at rest, scoped to one reviewer, expire automatically, and can be rotated.</p><div className="copy-box"><code>{sharePath || 'No active link yet'}</code><button onClick={copyShare}><Icon name="copy" size={15}/>{copied ? 'Copied' : guestToken ? 'Copy' : 'Create'}</button></div><small className="privacy-note"><Icon name="shield" size={14}/>{store.remoteMode ? 'Token value is shown only when created; Finalize stores only its SHA-256 hash.' : 'Demo link uses local browser state. Connect Supabase to enable hashed, expiring grants.'}</small></section>
    </div>}

    {tab === 'Discussion' && <div className="discussion-panel"><div className="discussion-list">{finalization.comments.length ? finalization.comments.map((c) => { const author = finalization.participants.find((p) => p.id === c.authorId); const req = finalization.requirements.find((r) => r.id === c.requirementId); return <div className="discussion-item" key={c.id}><span className="person-avatar small">{author?.initials || '?'}</span><div><div><strong>{author?.name || 'Reviewer'}</strong><span>{c.createdAt}</span></div>{req && <small>On: {req.title}</small>}<p>{c.body}</p></div></div>; }) : <div className="empty-state">No discussion yet.</div>}</div><CommentComposer finalization={finalization} store={store} requirementId={null} onClose={() => {}}/></div>}

    {tab === 'Activity' && <div className="activity-panel">{finalization.activity.map((a) => <div className="activity-item" key={a.id}><span className={`activity-mark ${a.kind}`}>{a.kind === 'pass' || a.kind === 'finalize' ? '✓' : '•'}</span><div><strong>{a.text}</strong><small>{a.actor} · {a.time}</small></div></div>)}</div>}

    {finalization.record && <div className="sealed-record"><div className="big-seal">✓</div><div><span className="page-kicker">Finalization record {finalization.record.id}</span><h2>Done. Verified. Finalized.</h2><p>{finalization.record.passedCount} checks passed · Artifact version {finalization.record.artifactVersion} · {finalization.record.fingerprint}</p></div><span className="record-time">{finalization.record.finalizedAt}</span></div>}

    {finalization.state !== 'FINALIZED' && <div className="sticky-gate">
      <div><span className={`gate-light ${info.readyToFinalize ? 'green' : info.readyForApproval ? 'amber' : 'red'}`}/><div><strong>{info.readyToFinalize ? 'Ready to finalize' : info.readyForApproval ? finalization.approval.status === 'pending' ? 'Approval requested' : finalization.approval.status === 'approved' ? 'Approval received' : 'Ready for approval' : `${info.blockers.length} blocker${info.blockers.length === 1 ? '' : 's'} remain`}</strong><small>{info.readyToFinalize ? 'All required conditions and final approval pass.' : info.readyForApproval ? 'The definition of done is satisfied.' : 'Required conditions must pass first.'}</small></div></div>
      <div className="gate-buttons">
        {finalization.approval.status === 'approved' ? <button className="finalize-btn" disabled={!info.readyToFinalize} onClick={() => store.finalize(finalization.id)}><Icon name="spark" size={17}/>Finalize & seal record</button> : <button className="dark-btn" disabled={!info.readyForApproval || finalization.approval.status === 'pending'} onClick={() => store.requestApproval(finalization.id)}>{finalization.approval.status === 'pending' ? 'Approval pending' : 'Request final approval'}</button>}
      </div>
    </div>}
  </AppShell>;
}
