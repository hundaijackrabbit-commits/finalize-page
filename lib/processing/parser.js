import { getObjectBuffer, putDerivedObject } from './storage';
import { extensionFor } from './signatures';
import { extractDocx, extractPdf, extractPptx, extractXlsx } from '../documents/extractors';

const MAX_PARSE_BYTES = Number(process.env.FINALIZE_PARSE_MAX_BYTES || 75 * 1024 * 1024);

function cleanText(value) {
  return String(value || '').replace(/\u0000/g, '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g,'\n\n\n').trim();
}

export async function parseArtifact(artifact) {
  const ext = extensionFor(artifact.original_filename);
  if (Number(artifact.size_bytes) > MAX_PARSE_BYTES) return { status: 'LIMITED', text: '', reason: 'file_too_large_for_document_parser' };
  if (['png','jpg','jpeg','webp','zip'].includes(ext)) {
    return { status: 'LIMITED', text: '', reason: ['png','jpg','jpeg','webp'].includes(ext) ? 'vision_parser_not_configured' : 'generic_archive_not_document' };
  }
  const buffer = await getObjectBuffer(artifact.storage_key, { maxBytes: MAX_PARSE_BYTES + 1024 });
  let result = { text:'', parser:'unknown', metrics:{} };
  if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'json') result = { text: cleanText(buffer.toString('utf8')), parser:'plain-text', metrics:{} };
  else if (ext === 'pdf') result = extractPdf(buffer);
  else if (ext === 'docx') result = extractDocx(buffer);
  else if (ext === 'pptx') result = extractPptx(buffer);
  else if (ext === 'xlsx') result = extractXlsx(buffer);
  else return { status:'LIMITED', text:'', reason:'parser_not_configured' };
  const text = cleanText(result.text);
  if (!text) return { status:'LIMITED', text:'', parser:result.parser, metrics:result.metrics||{}, reason:'no_text_extracted' };
  const key = `${artifact.organization_id}/${artifact.finalization_id}/${artifact.id}/derived/extracted.txt`;
  await putDerivedObject(key, text, 'text/plain; charset=utf-8');
  return { status:'COMPLETE', text, key, parser:result.parser, metrics:result.metrics||{}, reason:null };
}
