import { sign, randomBytes } from 'crypto';
import { canonicalizeBody, canonicalizeHeaders, buildCanonicalPayload } from './canonicalize';
import { computeContentHash, base64urlEncode } from './hash';
import type { VvsHeaders, VvsSignOptions, VvsSignResult } from './types';

export function generateNonce(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Sign a message per VVS-1 standard
 */
export function signMessage(
  body: string,
  emailHeaders: { from: string; to: string; subject: string; date: string },
  options: VvsSignOptions
): VvsSignResult {
  const canonBody = canonicalizeBody(body);
  const contentHash = computeContentHash(canonBody);
  const nonce = generateNonce();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const canonHeaders = canonicalizeHeaders(emailHeaders);
  const payload = buildCanonicalPayload(options.agentId, timestamp, nonce, contentHash, canonHeaders);

  const signature = sign(null, Buffer.from(payload, 'utf8'), {
    key: Buffer.from(options.privateKey),
    format: 'der',
    type: 'pkcs8',
  });

  const verifyMethods = options.verifyMethods || ['well-known', 'dns'];
  const headers: VvsHeaders = {
    'X-Venmail-Agent': options.agentId,
    'X-Venmail-Signature': base64urlEncode(signature),
    'X-Venmail-Algorithm': 'ed25519',
    'X-Venmail-Timestamp': timestamp,
    'X-Venmail-Nonce': nonce,
    'X-Venmail-Content-Hash': contentHash,
    'X-Venmail-Verify-Method': verifyMethods.join(','),
  };

  if (options.publicKey) headers['X-Venmail-Public-Key'] = options.publicKey;
  if (options.keyVersion !== undefined) headers['X-Venmail-Key-Version'] = options.keyVersion.toString();
  if (options.context) headers['X-Venmail-Context'] = options.context;

  return { headers, canonicalPayload: payload, contentHash };
}
