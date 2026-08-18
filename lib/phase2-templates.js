export const PHASE2_TEMPLATES = [
  {
    key: 'agency-website-launch',
    name: 'Agency Website Launch',
    description: 'QA, client approval, payment, handoff, access cleanup, and launch proof.',
    category: 'Agency',
    requirements: [
      ['Critical website QA passed','QA','automated',true],
      ['Client final review resolved','Client','human',true],
      ['Final invoice paid','Payment','integration',true],
      ['Production access confirmed','Access','human',true],
      ['Handoff package delivered','Handoff','human',true],
      ['Temporary access removed','Privacy','human',true],
      ['Social preview metadata configured','QA','automated',false],
    ],
  },
  {
    key: 'creative-delivery',
    name: 'Creative Delivery',
    description: 'Versioned client review, approval, source-file handoff, and payment closeout.',
    category: 'Agency',
    requirements: [
      ['All review comments resolved','Review','human',true],
      ['Final version approved','Client','human',true],
      ['Source files delivered','Handoff','human',true],
      ['Final payment received','Payment','integration',true],
    ],
  },
  {
    key: 'client-handoff',
    name: 'Client Handoff',
    description: 'Deliver files, transfer access, verify documentation, clean up privacy, and seal the record.',
    category: 'Agency',
    requirements: [
      ['Deliver final source files','Handoff','human',true],
      ['Transfer production credentials','Access','human',true],
      ['Client confirms ownership/access','Client','human',true],
      ['Remove temporary team access','Privacy','human',true],
      ['Archive final handoff evidence','Evidence','human',false],
    ],
  },

  {
    key: 'contract-completeness',
    name: 'Contract Completeness',
    description: 'Execution-readiness, referenced schedules, placeholders, signatures, and consistency. Not legal advice.',
    category: 'Documents',
    requirements: [
      ['Contract package assembled','Document','human',true],
      ['Required signatures received','Signature','integration',true],
      ['Internal owner review complete','Approval','human',false],
    ],
  },
  {
    key: 'proposal-readiness',
    name: 'Proposal Readiness',
    description: 'Scope, price, timeline, acceptance, references, and delivery readiness.',
    category: 'Documents',
    requirements: [
      ['Proposal package assembled','Document','human',true],
      ['Commercial owner review complete','Approval','human',true],
      ['Delivery recipients confirmed','Client','human',false],
    ],
  },
  {
    key: 'submission-package',
    name: 'Application / Submission Package',
    description: 'Attachments, declarations, dates, signatures, and submission completeness.',
    category: 'Documents',
    requirements: [
      ['Submission package assembled','Document','human',true],
      ['Submission owner approval received','Approval','human',true],
      ['Submission destination confirmed','Submission','human',false],
    ],
  },
  {
    key: 'report-completeness',
    name: 'Report Completeness',
    description: 'Findings, conclusions, sources, appendices, and unfinished-content review.',
    category: 'Documents',
    requirements: [
      ['Report package assembled','Document','human',true],
      ['Report owner approval received','Approval','human',true],
      ['Distribution list confirmed','Handoff','human',false],
    ],
  },
];
