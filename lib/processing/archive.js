import { getObjectBuffer } from './storage';

const EOCD = 0x06054b50;
const CEN = 0x02014b50;

function findEocd(tail) {
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === EOCD) return i;
  return -1;
}

function dangerousPath(name) {
  const normalized = name.replace(/\\/g, '/');
  return normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.split('/').includes('..') || normalized.includes('\u0000');
}

export async function inspectZip(storageKey, objectSize, options = {}) {
  const maxEntries = Number(options.maxEntries || process.env.FINALIZE_ZIP_MAX_ENTRIES || 20000);
  const maxExpanded = Number(options.maxExpanded || process.env.FINALIZE_ZIP_MAX_EXPANDED_BYTES || 2 * 1024 * 1024 * 1024);
  const maxRatio = Number(options.maxRatio || process.env.FINALIZE_ZIP_MAX_RATIO || 250);
  const tailSize = Math.min(Number(objectSize), 128 * 1024);
  const tailStart = Math.max(0, Number(objectSize) - tailSize);
  const tail = await getObjectBuffer(storageKey, { range: `bytes=${tailStart}-${Number(objectSize)-1}`, maxBytes: tailSize + 1024 });
  const eocdOffset = findEocd(tail);
  if (eocdOffset < 0) throw new Error('ZIP central directory terminator was not found');
  const entries = tail.readUInt16LE(eocdOffset + 10);
  const centralSize = tail.readUInt32LE(eocdOffset + 12);
  const centralOffset = tail.readUInt32LE(eocdOffset + 16);
  if (entries > maxEntries) throw new Error(`Archive has too many entries (${entries} > ${maxEntries})`);
  if (centralSize <= 0 || centralOffset + centralSize > Number(objectSize)) throw new Error('ZIP central directory bounds are invalid');
  if (centralSize > 16 * 1024 * 1024) throw new Error('ZIP central directory exceeds the Phase 1C safety ceiling');
  const directory = await getObjectBuffer(storageKey, { range: `bytes=${centralOffset}-${centralOffset + centralSize - 1}`, maxBytes: Math.min(centralSize + 1024, 16 * 1024 * 1024) });
  let cursor = 0;
  let parsed = 0;
  let compressedTotal = 0;
  let expandedTotal = 0;
  const unsafePaths = [];
  while (cursor + 46 <= directory.length && parsed < entries) {
    if (directory.readUInt32LE(cursor) !== CEN) throw new Error('Invalid ZIP central directory record');
    const compressed = directory.readUInt32LE(cursor + 20);
    const expanded = directory.readUInt32LE(cursor + 24);
    const nameLength = directory.readUInt16LE(cursor + 28);
    const extraLength = directory.readUInt16LE(cursor + 30);
    const commentLength = directory.readUInt16LE(cursor + 32);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > directory.length) throw new Error('Truncated ZIP central directory record');
    const name = directory.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (dangerousPath(name)) unsafePaths.push(name.slice(0, 180));
    compressedTotal += compressed;
    expandedTotal += expanded;
    if (expandedTotal > maxExpanded) throw new Error(`Archive expands beyond safety limit (${maxExpanded} bytes)`);
    cursor = end;
    parsed++;
  }
  if (parsed !== entries) throw new Error(`ZIP entry count mismatch (${parsed}/${entries})`);
  if (unsafePaths.length) throw new Error(`Archive contains unsafe paths: ${unsafePaths.slice(0,3).join(', ')}`);
  const ratio = compressedTotal ? expandedTotal / compressedTotal : expandedTotal ? Infinity : 1;
  if (ratio > maxRatio) throw new Error(`Archive expansion ratio is unsafe (${ratio.toFixed(1)}x)`);
  return { entries, compressedBytes: compressedTotal, expandedBytes: expandedTotal, expansionRatio: Number(ratio.toFixed(2)) };
}
