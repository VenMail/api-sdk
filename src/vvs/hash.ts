import { createHash } from 'crypto';

export function base64urlEncode(buffer: Buffer): string {
  return buffer.toString('base64url');
}

export function base64urlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

/**
 * VVS-1 §4.1 — Compute content hash
 */
export function computeContentHash(canonicalBody: string): string {
  const digest = createHash('sha256').update(canonicalBody, 'utf8').digest();
  return `sha256=${base64urlEncode(digest)}`;
}
