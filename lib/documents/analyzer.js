import { getDocumentSpec, inferDocumentType } from './specs';

const REFERENCE_RE = /\b(schedule|exhibit|appendix|attachment|annex)\s+([A-Z0-9][A-Z0-9.\-_]*)\b/gi;
const PLACEHOLDER_PATTERNS = [
  [/\bTBD\b/gi,'TBD'],[/\bTBC\b/gi,'TBC'],[/\bTODO\b/gi,'TODO'],[/\[\s*(?:insert|date|name|amount|address|company|client)[^\]]*\]/gi,'Bracket placeholder'],[/<{2,}[^>]{0,80}>{2,}/g,'Template token'],[/_{4,}/g,'Blank field'],[/\bto be agreed\b/gi,'To be agreed']
];

function evidence(snippet, extra={}) { return { snippet:String(snippet||'').replace(/\s+/g,' ').slice(0,420), ...extra }; }
function findFirst(text, patterns){for(const p of patterns){const m=text.match(p);if(m)return m[0];}return null;}
function has(text, patterns){return Boolean(findFirst(text,patterns));}
function legalEntities(text){return [...new Set([...text.matchAll(/\b([A-Z][A-Za-z&.' -]{2,80}\s(?:Inc\.?|Incorporated|LLC|Ltd\.?|Limited|Corp\.?|Corporation|LP|LLP))\b/g)].map(m=>m[1].trim()))].slice(0,20);}
function dateTokens(text){return [...new Set([...text.matchAll(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}\b|\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/gi)].map(m=>m[0]))].slice(0,40);}
function currencies(text){const values=new Set();if(/\bCAD\b|C\$/i.test(text))values.add('CAD');if(/\bUSD\b|US\$/i.test(text))values.add('USD');if(/\bEUR\b|€/i.test(text))values.add('EUR');if(/\bGBP\b|£/i.test(text))values.add('GBP');return [...values];}
function headings(text){return text.split('\n').map(s=>s.trim()).filter(Boolean).filter(s=>s.length<120 && (/^\d+(?:\.\d+)*\s+\S/.test(s)||/^[A-Z][A-Z0-9 &/\-]{4,}$/.test(s)||/^[A-Z][A-Za-z ]{2,40}:$/.test(s))).slice(0,100);}
function attachmentKey(name=''){return name.toLowerCase().replace(/\.[a-z0-9]+$/,'').replace(/[^a-z0-9]+/g,' ');}
function escapeRegExp(value=''){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function refPresent(ref, filenames, text=''){
  const target=`${ref.kind} ${ref.label}`.toLowerCase().replace(/[^a-z0-9]+/g,' ');
  const inFile=filenames.some(n=>{const key=attachmentKey(n),label=ref.label.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),kind=ref.kind.toLowerCase();const tokens=key.split(/\s+/).filter(Boolean);return key.includes(target)||(key.includes(kind)&&tokens.includes(label))||key.trim()===label;});
  if(inFile)return true;
  const escapedKind=escapeRegExp(ref.kind), escapedLabel=escapeRegExp(ref.label);
  const heading=new RegExp(String.raw`(?:^|\n)\s*${escapedKind}\s+${escapedLabel}\b`,'im');
  return heading.test(text);
}

export function analyzeDocument({artifact,text,allArtifacts=[]}){
  const type=artifact.document_type_override || inferDocumentType(artifact.original_filename,text); const spec=getDocumentSpec(type); const findings=[];
  const refs=[...text.matchAll(REFERENCE_RE)].map(m=>({kind:m[1],label:m[2],raw:m[0]}));
  const uniqueRefs=[...new Map(refs.map(r=>[`${r.kind.toLowerCase()}:${r.label.toLowerCase()}`,r])).values()];
  const filenames=allArtifacts.map(a=>a.original_filename||a.name||'');
  const missingRefs=uniqueRefs.filter(r=>!refPresent(r,filenames,text));
  const placeholders=[];for(const [re,label] of PLACEHOLDER_PATTERNS){for(const m of text.matchAll(re))placeholders.push({label,value:m[0],index:m.index});}
  const entities=legalEntities(text), dates=dateTokens(text), currency=currencies(text), hs=headings(text);
  const add=(rule,severity,title,detail,ev={})=>findings.push({ruleKey:rule,severity,title,detail,evidence:ev,status:'OPEN',source:'DETERMINISTIC'});
  if(placeholders.length) add('no_placeholders','BLOCKER',`${placeholders.length} unresolved placeholder${placeholders.length===1?'':'s'} detected`,'Replace unfinished template fields before finalization.',evidence(placeholders[0].value,{count:placeholders.length,examples:placeholders.slice(0,8)}));
  if(missingRefs.length) add('references_present','BLOCKER',`${missingRefs.length} referenced attachment${missingRefs.length===1?' is':'s are'} missing`,`The document references material that is not present in the current Finalization package.`,evidence(missingRefs[0].raw,{references:missingRefs}));
  if(currency.length>1) add('consistent_currency','WARNING','Multiple currencies detected',`Detected ${currency.join(', ')}. Confirm this is intentional and amounts are labeled consistently.`,{currencies:currency});

  const signatureCue=has(text,[/\bsignature\b/i,/\bsigned by\b/i,/\bin witness whereof\b/i,/\bauthorized signatory\b/i]);
  const blankSignature=has(text,[/signature\s*[:\-]?\s*_{4,}/i,/name\s*[:\-]?\s*_{4,}/i,/date\s*[:\-]?\s*_{4,}/i]);
  const rules={
    parties_identified: entities.length>=2 || has(text,[/\bbetween\b[\s\S]{0,500}\band\b/i]),
    effective_date: has(text,[/\beffective date\b/i,/\bdated as of\b/i,/\beffective as of\b/i]),
    signature_ready: signatureCue && !blankSignature,
    termination_terms: has(text,[/\btermination\b/i,/\bterminate\b/i]),
    governing_law: has(text,[/\bgoverning law\b/i,/\blaws of (?:the )?(?:province|state|country)/i]),
    payment_terms: has(text,[/\bpayment terms?\b/i,/\bfees?\b/i,/\binvoice\b/i,/\bcompensation\b/i]),
    scope_present: has(text,[/\bscope(?: of work)?\b/i,/\bdeliverables?\b/i,/\bservices\b/i]),
    pricing_present: has(text,[/\bpricing\b/i,/\bfees?\b/i,/\btotal\b/i,/[$€£]\s?\d/]),
    acceptance_present: has(text,[/\bacceptance\b/i,/\baccept(?:ed)? by\b/i,/\bapprove\b/i,/\bsignature\b/i]),
    timeline_present: has(text,[/\btimeline\b/i,/\bschedule\b/i,/\bmilestone\b/i,/\bdelivery date\b/i]),
    assumptions_present: has(text,[/\bassumptions?\b/i,/\bexclusions?\b/i,/\bout of scope\b/i]),
    applicant_identified: has(text,[/\bapplicant\b/i,/\bsubmitted by\b/i,/\borganization name\b/i]),
    submission_date: has(text,[/\bsubmission date\b/i,/\bdate submitted\b/i]) || dates.length>0,
    summary_present: has(text,[/\bexecutive summary\b/i,/\boverview\b/i]),
    findings_present: has(text,[/\bfindings\b/i,/\bresults\b/i]),
    conclusion_present: has(text,[/\bconclusion\b/i,/\brecommendations\b/i]),
    sources_present: has(text,[/\breferences\b/i,/\bsources\b/i,/\bbibliography\b/i]),
    no_placeholders: placeholders.length===0,
    references_present: missingRefs.length===0,
    consistent_currency: currency.length<=1,
    consistent_dates: true,
  };
  for(const [rule,label,severity] of spec.checks){if(rules[rule]===false && !findings.some(f=>f.ruleKey===rule)) add(rule,severity,label,`The ${spec.name} standard could not verify this condition from the current document.`,{documentType:type});}
  const score=Math.max(0,Math.round(100 - findings.reduce((n,f)=>n+(f.severity==='BLOCKER'?18:f.severity==='WARNING'?7:2),0)));
  return {
    profile:{documentType:type,specKey:spec.key,title:(hs[0]||artifact.original_filename).slice(0,240),language:'en',metrics:{characters:text.length,words:text.trim()?text.trim().split(/\s+/).length:0,headings:hs.length,references:uniqueRefs.length,placeholders:placeholders.length},structure:{headings:hs},entities:{legalEntities:entities,dates,currencies:currency},score},
    references:uniqueRefs.map(r=>({...r,present:refPresent(r,filenames,text)})), findings, spec,
  };
}
