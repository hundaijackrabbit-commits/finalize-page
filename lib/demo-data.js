export const WORKSPACE = {
  id: 'ws_northstar',
  name: 'Northstar Studio',
  plan: 'Studio',
  memberCount: 4,
  currentUser: { id: 'usr_hs', name: 'Hamza Shah', initials: 'HS', role: 'Owner' },
};

const BASE_FINALIZATIONS = [
  {
    id: 'fin_acme',
    slug: 'acme-website-launch',
    title: 'Acme website launch',
    type: 'Client project',
    client: 'Acme & Co.',
    dueLabel: 'Aug 20',
    state: 'BLOCKED',
    artifactVersion: 7,
    shareToken: 'acme-review',
    shareExpires: 'Aug 25, 2026',
    createdAt: 'Aug 16, 2026',
    updatedAt: 'Today, 2:46 AM',
    participants: [
      { id: 'usr_hs', name: 'Hamza Shah', initials: 'HS', role: 'Owner' },
      { id: 'usr_ak', name: 'Avery Kim', initials: 'AK', role: 'Developer' },
      { id: 'gst_lm', name: 'Lena Morris', initials: 'LM', role: 'Client' },
    ],
    requirements: [
      { id: 'req_scope', title: 'Final scope confirmed by client', category: 'Client', type: 'human', severity: 'blocker', required: true, ownerId: 'gst_lm', status: 'passed', evidence: 'Approved Aug 17 by Lena Morris', lastChecked: 'Aug 17' },
      { id: 'req_files', title: 'Production files delivered', category: 'Handoff', type: 'human', severity: 'blocker', required: true, ownerId: 'usr_hs', status: 'passed', evidence: 'Delivery package v7 recorded', lastChecked: 'Today' },
      { id: 'req_domain', title: 'Domain access received', category: 'Client', type: 'human', severity: 'blocker', required: true, ownerId: 'gst_lm', status: 'open', evidence: null, lastChecked: null },
      { id: 'req_invoice', title: 'Final invoice paid', category: 'Payment', type: 'integration', severity: 'blocker', required: true, ownerId: 'gst_lm', status: 'open', evidence: 'Awaiting payment · $1,240', lastChecked: 'Today' },
      { id: 'req_mobile', title: 'Mobile navigation re-check', category: 'QA', type: 'automated', severity: 'blocker', required: true, ownerId: 'usr_ak', status: 'open', evidence: 'Previous run: menu clipped at 390px', lastChecked: 'Yesterday' },
      { id: 'req_meta', title: 'Social preview metadata configured', category: 'QA', type: 'automated', severity: 'warning', required: false, ownerId: 'usr_ak', status: 'open', evidence: 'og:image missing on /pricing', lastChecked: 'Yesterday' },
    ],
    approval: {
      id: 'apr_launch',
      title: 'Final launch approval',
      status: 'not_requested',
      reviewerId: 'gst_lm',
      requestedAt: null,
      approvedAt: null,
      artifactVersion: 7,
    },
    comments: [
      { id: 'c1', authorId: 'usr_ak', body: 'Mobile menu fix is deployed to staging. Ready for another check.', createdAt: 'Today, 2:31 AM', requirementId: 'req_mobile' },
      { id: 'c2', authorId: 'gst_lm', body: 'I can send the registrar access this morning.', createdAt: 'Yesterday, 5:18 PM', requirementId: 'req_domain' },
    ],
    activity: [
      { id: 'a1', kind: 'pass', text: 'Production files marked complete', actor: 'Hamza', time: 'Today, 2:46 AM' },
      { id: 'a2', kind: 'comment', text: 'Avery commented on Mobile navigation re-check', actor: 'Avery', time: 'Today, 2:31 AM' },
      { id: 'a3', kind: 'share', text: 'Guest review link opened by Lena Morris', actor: 'Lena', time: 'Yesterday, 5:13 PM' },
    ],
    record: null,
  },
  {
    id: 'fin_vendor',
    slug: 'vendor-agreement',
    title: 'Vendor agreement',
    type: 'Contract closeout',
    client: 'Riverbend Supply',
    dueLabel: 'Aug 22',
    state: 'RESOLVING',
    artifactVersion: 3,
    shareToken: 'vendor-review',
    shareExpires: 'Aug 27, 2026',
    createdAt: 'Aug 15, 2026',
    updatedAt: 'Yesterday',
    participants: [
      { id: 'usr_hs', name: 'Hamza Shah', initials: 'HS', role: 'Owner' },
      { id: 'gst_rs', name: 'Ravi Singh', initials: 'RS', role: 'Vendor' },
    ],
    requirements: [
      { id: 'v1', title: 'Legal entity names confirmed', category: 'Contract', type: 'human', severity: 'blocker', required: true, ownerId: 'usr_hs', status: 'passed', evidence: 'Confirmed', lastChecked: 'Aug 16' },
      { id: 'v2', title: 'Schedule A attached', category: 'Contract', type: 'automated', severity: 'blocker', required: true, ownerId: 'usr_hs', status: 'passed', evidence: 'Schedule A.pdf', lastChecked: 'Aug 16' },
      { id: 'v3', title: 'Vendor signature received', category: 'Signature', type: 'integration', severity: 'blocker', required: true, ownerId: 'gst_rs', status: 'open', evidence: null, lastChecked: null },
    ],
    approval: { id: 'apr_vendor', title: 'Agreement execution approval', status: 'not_requested', reviewerId: 'usr_hs', requestedAt: null, approvedAt: null, artifactVersion: 3 },
    comments: [],
    reviewUrl: null, versions: [{id:'ver_1',versionNumber:1,artifactId:null,reason:'room_created',createdAt:'Just now'}], templateKey: null, handoffStatus: 'NOT_STARTED', privacyCloseoutStatus: 'OPEN', annotations: [], fileRequests: [], secureRequests: [], paymentGates: [], privacyItems: [], reminders: [],
    activity: [{ id: 'va1', kind: 'pass', text: 'Schedule A attached', actor: 'Hamza', time: 'Aug 16' }],
    record: null,
  },
  {
    id: 'fin_brand',
    slug: 'brand-handoff',
    title: 'Brand handoff',
    type: 'Client handoff',
    client: 'Marlow Coffee',
    dueLabel: 'Complete',
    state: 'FINALIZED',
    artifactVersion: 5,
    shareToken: 'brand-review',
    shareExpires: 'Expired',
    createdAt: 'Aug 8, 2026',
    updatedAt: 'Aug 14',
    participants: [{ id: 'usr_hs', name: 'Hamza Shah', initials: 'HS', role: 'Owner' }],
    requirements: [
      { id: 'b1', title: 'Source files delivered', category: 'Handoff', type: 'human', severity: 'blocker', required: true, ownerId: 'usr_hs', status: 'passed', evidence: 'Brand-package-v5.zip', lastChecked: 'Aug 14' },
      { id: 'b2', title: 'Client approval recorded', category: 'Client', type: 'human', severity: 'blocker', required: true, ownerId: 'usr_hs', status: 'passed', evidence: 'Approved by client', lastChecked: 'Aug 14' },
    ],
    approval: { id: 'apr_brand', title: 'Final handoff approval', status: 'approved', reviewerId: 'usr_hs', requestedAt: 'Aug 14', approvedAt: 'Aug 14', artifactVersion: 5 },
    comments: [],
    reviewUrl: null, versions: [{id:'ver_1',versionNumber:1,artifactId:null,reason:'room_created',createdAt:'Just now'}], templateKey: null, handoffStatus: 'NOT_STARTED', privacyCloseoutStatus: 'OPEN', annotations: [], fileRequests: [], secureRequests: [], paymentGates: [], privacyItems: [], reminders: [],
    activity: [{ id: 'ba1', kind: 'finalize', text: 'Finalization completed', actor: 'Hamza', time: 'Aug 14' }],
    record: { id: 'F-1007', finalizedAt: 'Aug 14, 2026 · 4:22 PM', artifactVersion: 5, fingerprint: 'SHA256: 9ac1…4f72', passedCount: 2 },
  },
 ];

const PHASE2_DEMO = {
  fin_acme: {
    reviewUrl: 'https://example.com', versions:[{id:'ver7',versionNumber:7,artifactId:null,reason:'client_file_received',createdAt:'Today, 12:14 AM'},{id:'ver6',versionNumber:6,artifactId:null,reason:'artifact_uploaded',createdAt:'Yesterday'},{id:'ver5',versionNumber:5,artifactId:null,reason:'artifact_uploaded',createdAt:'Aug 16'}], templateKey: 'agency-website-launch', handoffStatus: 'IN_PROGRESS', privacyCloseoutStatus: 'OPEN',
    annotations: [
      { id:'ann_1', artifactVersion:7, targetType:'website', targetRef:'/pricing', x:71, y:31, body:'This CTA says “Start trial” but the homepage says “Book a demo”. Please confirm the final wording.', visibility:'shared', status:'open', authorId:'gst_lm', createdAt:'Today, 1:52 AM' },
      { id:'ann_2', artifactVersion:7, targetType:'website', targetRef:'/home', x:36, y:63, body:'Approved once the mobile spacing fix is live.', visibility:'shared', status:'resolved', authorId:'gst_lm', createdAt:'Yesterday' },
    ],
    fileRequests: [
      { id:'fr_1', title:'Domain transfer / registrar details', description:'Needed for production DNS handoff.', acceptedExtensions:['pdf','txt'], required:true, participantId:'gst_lm', status:'requested', artifactId:null, dueAt:null, completedAt:null },
      { id:'fr_2', title:'Final brand assets', description:'Source logo and approved brand pack.', acceptedExtensions:['zip','pdf'], required:true, participantId:'gst_lm', status:'received', artifactId:null, dueAt:null, completedAt:'Yesterday' },
    ],
    secureRequests: [
      { id:'sec_1', title:'Registrar access', requestType:'credential', participantId:'gst_lm', status:'requested', expiresAt:'Aug 25, 2026', submittedAt:null, destroyedAt:null },
    ],
    paymentGates: [
      { id:'pay_1', label:'Final project invoice', amountCents:124000, currency:'CAD', provider:'manual', providerReference:'INV-1042', paymentUrl:null, status:'unpaid', paidAt:null },
    ],
    privacyItems: [
      { id:'priv_1', itemType:'credential', title:'Destroy temporary registrar credential', description:'Remove vault secret after DNS ownership is verified.', required:true, status:'open', dueAt:null, resolvedAt:null },
      { id:'priv_2', itemType:'guest_link', title:'Revoke temporary review link', description:'Automatically revoke after finalization.', required:true, status:'scheduled', dueAt:null, resolvedAt:null },
      { id:'priv_3', itemType:'test_account', title:'Remove staging test account', description:'Temporary QA account should not survive handoff.', required:true, status:'open', dueAt:null, resolvedAt:null },
    ],
    reminders: [{ id:'rem_1', participantId:'gst_lm', channel:'email', subject:'2 items still needed to finalize Acme website', status:'scheduled', sendAt:'Tomorrow, 9:00 AM', sentAt:null }],
    artifacts: [
      {id:'art_acme_1',name:'Acme-launch-handoff.pdf',size:3480000,mimeType:'application/pdf',status:'READY',privacy:'CONFIDENTIAL',signatureStatus:'PASSED',archiveScanStatus:'NOT_APPLICABLE',malwareScanStatus:'CLEAN',parserStatus:'COMPLETE',privacyScanStatus:'COMPLETE',redactionStatus:'COMPLETE',safeForAi:false,aiBlockedReason:'confidential_ai_processing_disabled',sourceSha256:'76f2d2c2a8d1b10a5ce10a0b4dd7dce50b0319b9a4a2aa72c50df83644c39f02',piiSummary:{email:4,phone:2,person_name:3},retentionDeleteAfter:'Sep 17, 2026'},
      {id:'art_acme_2',name:'launch-checklist.txt',size:24000,mimeType:'text/plain',status:'READY',privacy:'BUSINESS',signatureStatus:'PASSED',archiveScanStatus:'NOT_APPLICABLE',malwareScanStatus:'CLEAN',parserStatus:'COMPLETE',privacyScanStatus:'COMPLETE',redactionStatus:'COMPLETE',safeForAi:true,aiBlockedReason:null,sourceSha256:'a8d729fc5ca77d2f749408503a4df82cf8c24bb7549d741c60f710351e0d2ea8',piiSummary:{email:1},retentionDeleteAfter:'Sep 17, 2026'}
    ],
  },
  fin_vendor: { reviewUrl:null, versions:[{id:'v3',versionNumber:3,artifactId:null,reason:'artifact_uploaded',createdAt:'Aug 16'}], templateKey:null, handoffStatus:'NOT_STARTED', privacyCloseoutStatus:'OPEN', annotations:[], fileRequests:[], secureRequests:[], paymentGates:[], privacyItems:[], reminders:[], artifacts:[{id:'art_vendor_1',name:'Vendor-agreement-v3.pdf',size:1920000,mimeType:'application/pdf',status:'READY',privacy:'RESTRICTED',signatureStatus:'PASSED',archiveScanStatus:'NOT_APPLICABLE',malwareScanStatus:'CLEAN',parserStatus:'COMPLETE',privacyScanStatus:'COMPLETE',redactionStatus:'COMPLETE',safeForAi:false,aiBlockedReason:'restricted_ai_processing_disabled',sourceSha256:'bb4acd8edc459043387d09808019324988560206810b51d8bce41468de5f12a9',piiSummary:{email:2,signature:2,financial_reference:1},retentionDeleteAfter:'Sep 15, 2026'}] },
  fin_brand: { reviewUrl:null, versions:[{id:'b5',versionNumber:5,artifactId:null,reason:'artifact_uploaded',createdAt:'Aug 14'}], templateKey:'creative-delivery', handoffStatus:'COMPLETE', privacyCloseoutStatus:'COMPLETE', annotations:[], fileRequests:[], secureRequests:[], paymentGates:[{ id:'pay_brand', label:'Final invoice', amountCents:65000, currency:'CAD', provider:'manual', providerReference:'INV-1007', paymentUrl:null, status:'paid', paidAt:'Aug 14' }], privacyItems:[{ id:'priv_brand', itemType:'access', title:'Temporary access removed', description:'Closeout completed', required:true, status:'resolved', dueAt:null, resolvedAt:'Aug 14' }], reminders:[], artifacts:[{id:'art_brand_1',name:'Marlow-brand-package.zip',size:84200000,mimeType:'application/zip',status:'READY',privacy:'BUSINESS',signatureStatus:'PASSED',archiveScanStatus:'PASSED',malwareScanStatus:'CLEAN',parserStatus:'LIMITED',privacyScanStatus:'LIMITED',redactionStatus:'LIMITED',safeForAi:false,aiBlockedReason:'privacy_scan_incomplete',sourceSha256:'ea3a5419175f6fd773937814466656212ead064555a9ec91af9fe32c0f24fd20',piiSummary:{},retentionDeleteAfter:'Sep 13, 2026'}] },
};

export const INITIAL_FINALIZATIONS = BASE_FINALIZATIONS.map((f) => ({
  ...f,
  ...(PHASE2_DEMO[f.id] || {}),
  reviewUrl: PHASE2_DEMO[f.id]?.reviewUrl || null,
  versions: PHASE2_DEMO[f.id]?.versions || [{id:`ver_${f.artifactVersion}`,versionNumber:f.artifactVersion,artifactId:null,reason:'current',createdAt:f.updatedAt}],
  annotations: PHASE2_DEMO[f.id]?.annotations || [],
  fileRequests: PHASE2_DEMO[f.id]?.fileRequests || [],
  secureRequests: PHASE2_DEMO[f.id]?.secureRequests || [],
  paymentGates: PHASE2_DEMO[f.id]?.paymentGates || [],
  privacyItems: PHASE2_DEMO[f.id]?.privacyItems || [],
  reminders: PHASE2_DEMO[f.id]?.reminders || [],
}));

export function createBlankFinalization({ title, type = 'Client project', client = 'New client' }) {
  const id = `fin_${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    slug: id,
    title: title || 'Untitled finalization',
    type,
    client,
    dueLabel: 'No due date',
    state: 'DRAFT',
    artifactVersion: 1,
    shareToken: `review-${Math.random().toString(36).slice(2, 9)}`,
    shareExpires: '7 days after sharing',
    createdAt: 'Today',
    updatedAt: 'Just now',
    participants: [WORKSPACE.currentUser],
    requirements: [
      { id: `req_${Math.random().toString(36).slice(2, 8)}`, title: 'Define what done means', category: 'Setup', type: 'human', severity: 'blocker', required: true, ownerId: WORKSPACE.currentUser.id, status: 'open', evidence: null, lastChecked: null },
    ],
    approval: { id: `apr_${Math.random().toString(36).slice(2, 8)}`, title: 'Final approval', status: 'not_requested', reviewerId: WORKSPACE.currentUser.id, requestedAt: null, approvedAt: null, artifactVersion: 1 },
    comments: [],
    reviewUrl: null, versions: [{id:'ver_1',versionNumber:1,artifactId:null,reason:'room_created',createdAt:'Just now'}], templateKey: null, handoffStatus: 'NOT_STARTED', privacyCloseoutStatus: 'OPEN', annotations: [], fileRequests: [], secureRequests: [], paymentGates: [], privacyItems: [], reminders: [],
    activity: [{ id: `a_${Math.random().toString(36).slice(2, 8)}`, kind: 'create', text: 'Finalization created', actor: WORKSPACE.currentUser.name, time: 'Just now' }],
    record: null,
  };
}
