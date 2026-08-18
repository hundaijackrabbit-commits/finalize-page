const DETECTORS = [
  { category: 'EMAIL', label: 'Email address', sensitivity: 'PERSONAL', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { category: 'PHONE', label: 'Phone number', sensitivity: 'PERSONAL', pattern: /(?<!\d)(?:\+?1[ .-]?)?(?:\(?\d{3}\)?[ .-]?)\d{3}[ .-]\d{4}(?!\d)/g },
  { category: 'SIN', label: 'Canadian SIN-like identifier', sensitivity: 'RESTRICTED', pattern: /(?<!\d)\d{3}[ -]?\d{3}[ -]?\d{3}(?!\d)/g },
  { category: 'CREDIT_CARD', label: 'Payment-card-like number', sensitivity: 'RESTRICTED', pattern: /(?<!\d)(?:\d[ -]*?){13,19}(?!\d)/g },
  { category: 'IP_ADDRESS', label: 'IP address', sensitivity: 'BUSINESS', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
];

function luhn(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0, parity = digits.length % 2;
  for (let i = 0; i < digits.length; i++) { let d = Number(digits[i]); if (i % 2 === parity) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  return sum % 10 === 0;
}

export function scanPrivacy(text = '') {
  const findings = [];
  for (const detector of DETECTORS) {
    const matches = [...text.matchAll(detector.pattern)].filter((m) => detector.category !== 'CREDIT_CARD' || luhn(m[0]));
    if (!matches.length) continue;
    findings.push({
      category: detector.category,
      label: detector.label,
      sensitivity: detector.sensitivity,
      count: matches.length,
      offsets: matches.slice(0, 25).map((m) => ({ start: m.index, end: m.index + m[0].length })),
    });
  }
  return findings;
}

export function redactPrivacy(text = '', findings = []) {
  const ranges = [];
  for (const finding of findings) for (const offset of finding.offsets || []) ranges.push({ ...offset, category: finding.category });
  ranges.sort((a,b) => b.start-a.start);
  let result = text;
  const counters = {};
  for (const range of ranges) {
    counters[range.category] = (counters[range.category] || 0) + 1;
    result = `${result.slice(0, range.start)}[${range.category}_${counters[range.category]}]${result.slice(range.end)}`;
  }
  return result;
}

export function summarizePrivacy(findings = []) {
  return Object.fromEntries(findings.map((f) => [f.category, f.count]));
}
