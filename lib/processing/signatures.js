const TYPES = {
  pdf: { mime: 'application/pdf', check: (b) => b.subarray(0, 5).toString('ascii') === '%PDF-' },
  png: { mime: 'image/png', check: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) },
  jpg: { mime: 'image/jpeg', check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mime: 'image/jpeg', check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  webp: { mime: 'image/webp', check: (b) => b.length >= 12 && b.subarray(0,4).toString('ascii') === 'RIFF' && b.subarray(8,12).toString('ascii') === 'WEBP' },
  zip: { mime: 'application/zip', check: isZip },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', check: isZip },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', check: isZip },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', check: isZip },
  txt: { mime: 'text/plain', check: looksLikeText },
  md: { mime: 'text/markdown', check: looksLikeText },
  csv: { mime: 'text/csv', check: looksLikeText },
  json: { mime: 'application/json', check: looksLikeText },
};

function isZip(buffer) {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && [[0x03,0x04],[0x05,0x06],[0x07,0x08]].some(([a,b]) => buffer[2] === a && buffer[3] === b);
}

function looksLikeText(buffer) {
  if (buffer.includes(0x00)) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (!sample.length) return true;
  let controls = 0;
  for (const byte of sample) if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) controls++;
  return controls / sample.length < 0.02;
}

export function extensionFor(name = '') {
  return name.split('.').pop()?.toLowerCase() || '';
}

export function validateFileSignature(filename, declaredMime, header) {
  const ext = extensionFor(filename);
  const rule = TYPES[ext];
  if (!rule) return { ok: false, reason: 'unsupported_extension', ext };
  if (!rule.check(header)) return { ok: false, reason: 'signature_mismatch', ext, expectedMime: rule.mime };
  return { ok: true, ext, detectedMime: rule.mime, declaredMime, signature: ext === 'docx' || ext === 'xlsx' || ext === 'pptx' ? 'zip-container' : ext };
}
