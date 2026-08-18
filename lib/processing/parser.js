import { getObjectBuffer, putDerivedObject } from './storage';
import { extensionFor } from './signatures';

const MAX_PARSE_BYTES = Number(process.env.FINALIZE_PARSE_MAX_BYTES || 50 * 1024 * 1024);

function cleanText(value) {
  return value.replace(/\u0000/g, '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

function bestEffortPdfText(buffer) {
  const source = buffer.toString('latin1');
  const strings = [];
  const regex = /\((?:\\.|[^\\)]){2,400}\)/g;
  let match;
  while ((match = regex.exec(source)) && strings.length < 10000) {
    let text = match[0].slice(1,-1)
      .replace(/\\([()\\])/g, '$1')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\\t/g, '\t');
    const printable = [...text].filter((c) => c.charCodeAt(0) >= 32 || c === '\n').length;
    if (text.length && printable / text.length > 0.85) strings.push(text);
  }
  return cleanText(strings.join(' '));
}

export async function parseArtifact(artifact) {
  const ext = extensionFor(artifact.original_filename);
  if (Number(artifact.size_bytes) > MAX_PARSE_BYTES) return { status: 'LIMITED', text: '', reason: 'file_too_large_for_local_parser' };
  if (['png','jpg','jpeg','webp','zip','docx','xlsx','pptx'].includes(ext)) {
    return { status: 'LIMITED', text: '', reason: ['png','jpg','jpeg','webp'].includes(ext) ? 'vision_parser_not_configured' : 'office_parser_not_configured' };
  }
  const buffer = await getObjectBuffer(artifact.storage_key, { maxBytes: MAX_PARSE_BYTES + 1024 });
  let text = '';
  let parser = 'plain-text';
  if (ext === 'txt' || ext === 'md') text = cleanText(buffer.toString('utf8'));
  else if (ext === 'pdf') { text = bestEffortPdfText(buffer); parser = 'pdf-best-effort'; }
  else return { status: 'LIMITED', text: '', reason: 'parser_not_configured' };
  const key = `${artifact.organization_id}/${artifact.finalization_id}/${artifact.id}/derived/extracted.txt`;
  await putDerivedObject(key, text, 'text/plain; charset=utf-8');
  return { status: text ? 'COMPLETE' : 'LIMITED', text, key, parser, reason: text ? null : 'no_text_extracted' };
}
