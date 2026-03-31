/**
 * VVS-1 §4.1 — Body canonicalization
 */
export function canonicalizeBody(rawBody: string): string {
  return rawBody
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.replace(/[\t ]+$/, ''))
    .join('\n');
}

/**
 * VVS-1 §4.2 — Header canonicalization
 */
export function canonicalizeHeaders(headers: {
  from: string;
  to: string;
  subject: string;
  date: string;
}): string {
  return [
    { name: 'date', value: headers.date },
    { name: 'from', value: headers.from },
    { name: 'subject', value: headers.subject },
    { name: 'to', value: headers.to },
  ]
    .map(f => ({
      name: f.name,
      value: f.value.replace(/\r?\n[\t ]+/g, ' ').trim(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(f => `${f.name}:${f.value}`)
    .join('\n');
}

/**
 * VVS-1 §4.2 — Build canonical signing payload
 */
export function buildCanonicalPayload(
  agentId: string,
  timestamp: string,
  nonce: string,
  contentHash: string,
  canonicalHeaders: string
): string {
  return `${agentId}\n${timestamp}\n${nonce}\n${contentHash}\n${canonicalHeaders}\n`;
}
