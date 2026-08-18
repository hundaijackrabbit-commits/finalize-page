export const DOCUMENT_SPECS = {
  GENERIC: {
    key: 'generic-document',
    name: 'General Document',
    description: 'Completeness, placeholders, references, consistency, and obvious unfinished elements.',
    checks: [
      ['no_placeholders','No unresolved placeholders','BLOCKER'],
      ['references_present','Referenced attachments are present','BLOCKER'],
      ['consistent_currency','Currency notation is consistent','WARNING'],
      ['consistent_dates','Key dates do not obviously conflict','WARNING'],
    ],
  },
  CONTRACT: {
    key: 'contract-completeness',
    name: 'Contract Completeness',
    description: 'Execution-readiness checks without providing legal advice.',
    checks: [
      ['parties_identified','Parties are identified','BLOCKER'],
      ['effective_date','Effective date is present','BLOCKER'],
      ['no_placeholders','No unresolved placeholders','BLOCKER'],
      ['references_present','Referenced schedules/exhibits are present','BLOCKER'],
      ['signature_ready','Signature section appears complete','BLOCKER'],
      ['termination_terms','Termination terms are present','WARNING'],
      ['governing_law','Governing law is stated','WARNING'],
      ['payment_terms','Payment/fees terms are present when applicable','WARNING'],
      ['consistent_currency','Currency notation is consistent','WARNING'],
    ],
  },
  PROPOSAL: {
    key: 'proposal-readiness',
    name: 'Proposal Readiness',
    description: 'Client-ready scope, price, timeline, assumptions, and acceptance checks.',
    checks: [
      ['scope_present','Scope or deliverables are defined','BLOCKER'],
      ['pricing_present','Pricing or commercial terms are present','BLOCKER'],
      ['acceptance_present','Acceptance or next-step mechanism is present','BLOCKER'],
      ['no_placeholders','No unresolved placeholders','BLOCKER'],
      ['references_present','Referenced attachments are present','BLOCKER'],
      ['timeline_present','Timeline or delivery timing is stated','WARNING'],
      ['assumptions_present','Assumptions/exclusions are stated','WARNING'],
      ['consistent_currency','Currency notation is consistent','WARNING'],
    ],
  },
  APPLICATION: {
    key: 'submission-package',
    name: 'Application / Submission Package',
    description: 'Submission completeness, required references, dates, signatures, and attachments.',
    checks: [
      ['applicant_identified','Applicant/submitter is identified','BLOCKER'],
      ['submission_date','Submission date is present','BLOCKER'],
      ['signature_ready','Signature/declaration section appears complete','BLOCKER'],
      ['references_present','Referenced attachments are present','BLOCKER'],
      ['no_placeholders','No unresolved placeholders','BLOCKER'],
      ['consistent_dates','Key dates do not obviously conflict','WARNING'],
    ],
  },
  REPORT: {
    key: 'report-completeness',
    name: 'Report Completeness',
    description: 'Professional-report structure, conclusions, sources, and unfinished-content checks.',
    checks: [
      ['summary_present','Executive summary or overview is present','WARNING'],
      ['findings_present','Findings/results section is present','BLOCKER'],
      ['conclusion_present','Conclusion/recommendations are present','BLOCKER'],
      ['sources_present','Sources/references are present when claims require them','WARNING'],
      ['no_placeholders','No unresolved placeholders','BLOCKER'],
      ['references_present','Referenced appendices are present','BLOCKER'],
    ],
  },
};

export function getDocumentSpec(type = 'GENERIC') {
  return DOCUMENT_SPECS[type] || DOCUMENT_SPECS.GENERIC;
}

export function inferDocumentType(filename = '', text = '') {
  const sample = `${filename}\n${text.slice(0,12000)}`.toLowerCase();
  const score = { CONTRACT:0, PROPOSAL:0, APPLICATION:0, REPORT:0 };
  for (const token of ['agreement','contract','whereas','governing law','termination','party','parties']) if (sample.includes(token)) score.CONTRACT++;
  for (const token of ['proposal','scope of work','deliverables','estimate','quotation','valid for','project fee']) if (sample.includes(token)) score.PROPOSAL++;
  for (const token of ['application','applicant','submitter','declaration','eligibility','required documents']) if (sample.includes(token)) score.APPLICATION++;
  for (const token of ['report','executive summary','methodology','findings','recommendations','references']) if (sample.includes(token)) score.REPORT++;
  const [type,value] = Object.entries(score).sort((a,b)=>b[1]-a[1])[0];
  return value >= 2 ? type : 'GENERIC';
}
