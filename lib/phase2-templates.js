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
];
