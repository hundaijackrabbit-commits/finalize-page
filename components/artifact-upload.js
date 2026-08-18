'use client';

import { useRef, useState } from 'react';
import { Icon } from './icons';
import { uploadArtifact } from '../lib/upload-client';

function formatBytes(value = 0) {
  if (!value) return '0 B';
  const units = ['B','KB','MB','GB','TB'];
  const i = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function stateLabel(value) {
  return String(value || 'PENDING').toLowerCase().replaceAll('_', ' ');
}

function ProcessingStages({ artifact }) {
  const stages = [
    ['Signature', artifact.signatureStatus],
    ['Archive', artifact.archiveScanStatus],
    ['Malware', artifact.malwareScanStatus],
    ['Parser', artifact.parserStatus],
    ['Privacy', artifact.privacyScanStatus],
    ['AI copy', artifact.redactionStatus],
  ];
  return <div className="artifact-pipeline">{stages.map(([label,status]) => {
    const passed = ['PASSED','CLEAN','COMPLETE','NOT_APPLICABLE'].includes(status);
    const limited = status === 'LIMITED';
    const failed = ['FAILED','INFECTED','REJECTED','DEAD_LETTER'].includes(status);
    return <span className={passed ? 'stage-pass' : limited ? 'stage-limited' : failed ? 'stage-fail' : 'stage-pending'} key={label}><i/>{label}<small>{stateLabel(status)}</small></span>;
  })}</div>;
}

export function ArtifactUpload({ finalization, store }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [privacy, setPrivacy] = useState('BUSINESS');
  const [jobs, setJobs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(null);

  async function refresh() {
    setRefreshing(true);
    try { await store.refresh(); } finally { setRefreshing(false); }
  }

  async function retryArtifact(id) {
    if (!store.remoteMode) return;
    setRetrying(id);
    try {
      const response = await fetch(`/api/artifacts/${id}/retry`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || 'Retry failed');
      await store.refresh();
    } catch (error) {
      setJobs((items) => [{ key: `retry-${Date.now()}`, name: 'Processing retry', size: 0, progress: 0, status: 'failed', error: error.message }, ...items]);
    } finally { setRetrying(null); }
  }

  async function handleFiles(files) {
    const list = Array.from(files || []);
    for (const file of list) {
      const key = `${file.name}-${file.lastModified}-${Math.random()}`;
      setJobs((items) => [{ key, name: file.name, size: file.size, progress: 0, status: store.remoteMode ? 'uploading' : 'demo', error: null }, ...items]);
      if (!store.remoteMode) {
        let value = 0;
        const timer = window.setInterval(() => {
          value = Math.min(100, value + 17);
          setJobs((items) => items.map((j) => j.key === key ? { ...j, progress: value, status: value === 100 ? 'quarantined' : 'demo' } : j));
          if (value === 100) window.clearInterval(timer);
        }, 180);
        continue;
      }
      try {
        const result = await uploadArtifact({ finalizationId: finalization.id, file, privacy, onProgress: (progress) => setJobs((items) => items.map((j) => j.key === key ? { ...j, progress } : j)) });
        setJobs((items) => items.map((j) => j.key === key ? { ...j, progress: 100, status: result.status?.toLowerCase() || 'quarantined' } : j));
        await store.refresh();
      } catch (error) {
        setJobs((items) => items.map((j) => j.key === key ? { ...j, status: 'failed', error: error.message } : j));
      }
    }
  }

  const artifacts = finalization.artifacts || [];
  return <div className="files-panel">
    <div className="file-upload-head">
      <div><span className="page-kicker">Artifact intake</span><h3>Files for this Finalization</h3><p>Originals remain immutable. Production files stay quarantined until integrity, malware, archive and privacy processing have cleared the applicable gates.</p></div>
      <label className="privacy-select"><span>Privacy profile</span><select value={privacy} onChange={(e) => setPrivacy(e.target.value)}><option value="PUBLIC">Public</option><option value="BUSINESS">Business</option><option value="CONFIDENTIAL">Confidential</option><option value="RESTRICTED">Restricted</option></select></label>
    </div>
    <div className={`upload-drop ${dragging ? 'dragging' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }} onClick={() => inputRef.current?.click()}>
      <input ref={inputRef} type="file" hidden multiple accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp,.zip" onChange={(e) => handleFiles(e.target.files)}/>
      <span className="upload-symbol"><Icon name="plus" size={20}/></span>
      <strong>Drop files here or choose from your device</strong>
      <small>PDF, Office, text, images and ZIP · multipart uploads up to 5 GB per file</small>
      {!store.remoteMode && <em>Demo mode: upload progress is simulated. Connect Supabase + S3 to activate secure storage.</em>}
    </div>

    {jobs.length > 0 && <div className="upload-jobs">{jobs.map((job) => <div className="upload-job" key={job.key}><div className="file-icon">↑</div><div className="upload-job-main"><div><strong>{job.name}</strong><span>{formatBytes(job.size)}</span></div><div className="upload-progress"><i style={{ width: `${job.progress}%` }}/></div><small className={job.status === 'failed' ? 'error-text' : ''}>{job.status === 'failed' ? job.error : job.status === 'quarantined' ? 'Uploaded · trust processing queued' : job.status === 'demo' ? `Demo upload · ${job.progress}%` : `Uploading securely · ${job.progress}%`}</small></div></div>)}</div>}

    <div className="artifact-list-head"><strong>Stored artifacts</strong><div><span>{artifacts.length}</span>{store.remoteMode && <button className="mini-action" onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh processing'}</button>}</div></div>
    <div className="artifact-list">
      {artifacts.length ? artifacts.map((a) => {
        const failed = ['FAILED','REJECTED'].includes(a.status) || a.processingError;
        const pii = Object.entries(a.piiSummary || {});
        return <div className="artifact-row artifact-row-expanded" key={a.id}>
          <div className="file-icon">F</div>
          <div className="artifact-main">
            <div className="artifact-title-line"><div><strong>{a.name}</strong><small>{formatBytes(a.size)} · {a.privacy} · {a.mimeType}</small></div><div className="artifact-state"><span className={`status-pill ${a.status === 'READY' ? 'finalized' : ['QUARANTINED','SCANNING','PROCESSING'].includes(a.status) ? 'waiting' : failed ? 'blocked' : 'muted'}`}>{stateLabel(a.status)}</span><small>{a.safeForAi ? 'Privacy-minimized AI copy ready' : a.status === 'READY' ? 'Human workflow ready · AI copy limited' : stateLabel(a.malwareScanStatus)}</small></div></div>
            <ProcessingStages artifact={a}/>
            {a.sourceSha256 && <div className="artifact-hash"><span>SHA-256</span><code>{a.sourceSha256}</code></div>}
            {pii.length > 0 && <div className="pii-chips"><span>Sensitive-data scan</span>{pii.map(([type,count]) => <em key={type}>{type.replaceAll('_',' ')} · {count}</em>)}</div>}
            {a.processingError && <div className="processing-error"><strong>Processing issue</strong><span>{a.processingError}</span>{store.remoteMode && a.status !== 'INFECTED' && <button onClick={() => retryArtifact(a.id)} disabled={retrying === a.id}>{retrying === a.id ? 'Queuing…' : 'Retry from quarantine'}</button>}</div>}
          </div>
        </div>;
      }) : <div className="empty-state">No stored artifacts yet.</div>}
    </div>
    <div className="file-security-note"><Icon name="shield" size={18}/><div><strong>AI access is a separate security gate.</strong><span>A file can be safe for storage and client workflow without being safe to send to an AI processor. Only privacy-scanned, redacted derivatives receive <b>safe_for_ai</b>.</span></div></div>
  </div>;
}
