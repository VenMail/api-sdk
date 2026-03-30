import { verify } from 'crypto';
import { canonicalizeBody, canonicalizeHeaders, buildCanonicalPayload } from './canonicalize';
import { computeContentHash, base64urlDecode } from './hash';
import { importPublicKey } from './keys';
import { resolveKey } from './resolve';
import type { VvsTrustLevel, VvsVerifyResult } from './types';

export interface VerifyOptions {
  timestampWindow?: number;
}

/**
 * Verify a VVS-1 signed message per §7
 */
export async function verifyMessage(
  headers: Record<string, string>,
  body: string,
  emailHeaders: { from: string; to: string; subject: string; date: string },
  options: VerifyOptions = {}
): Promise<VvsVerifyResult> {
  const window = options.timestampWindow ?? 3600;

  const agentId = headers['X-Venmail-Agent'] || headers['x-venmail-agent'];
  if (!agentId) return { trustLevel: 'UNKNOWN' };

  const sig = headers['X-Venmail-Signature'] || headers['x-venmail-signature'];
  const algo = headers['X-Venmail-Algorithm'] || headers['x-venmail-algorithm'];
  const ts = headers['X-Venmail-Timestamp'] || headers['x-venmail-timestamp'];
  const nonce = headers['X-Venmail-Nonce'] || headers['x-venmail-nonce'];
  const contentHashHeader = headers['X-Venmail-Content-Hash'] || headers['x-venmail-content-hash'];
  const verifyMethods = (headers['X-Venmail-Verify-Method'] || headers['x-venmail-verify-method'] || '').split(',').map(m => m.trim());
  const embeddedKey = headers['X-Venmail-Public-Key'] || headers['x-venmail-public-key'];

  if (!sig || !algo || !ts || !nonce || !contentHashHeader) {
    return { trustLevel: 'FAILED', agentId, error: 'Missing required VVS headers' };
  }
  if (algo !== 'ed25519') {
    return { trustLevel: 'FAILED', agentId, error: `Unsupported algorithm: ${algo}` };
  }

  const timestamp = parseInt(ts, 10);
  if (isNaN(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > window) {
    return { trustLevel: 'FAILED', agentId, error: 'Timestamp outside replay window' };
  }

  const atIndex = agentId.indexOf('@');
  if (atIndex < 1) return { trustLevel: 'FAILED', agentId, error: 'Malformed agent ID' };
  const agentName = agentId.substring(0, atIndex);
  const domain = agentId.substring(atIndex + 1);

  const canonBody = canonicalizeBody(body);
  const computedHash = computeContentHash(canonBody);
  if (computedHash !== contentHashHeader) {
    return { trustLevel: 'FAILED', agentId, error: 'Content hash mismatch (body tampered)' };
  }

  const canonHeaders = canonicalizeHeaders(emailHeaders);
  const payload = buildCanonicalPayload(agentId, ts, nonce, computedHash, canonHeaders);

  for (const method of verifyMethods) {
    try {
      const resolved = await resolveKey(agentName, domain, method, embeddedKey);
      if (!resolved) continue;
      if (resolved.status !== 'active') {
        return { trustLevel: 'FAILED', agentId, error: `Agent status: ${resolved.status}` };
      }

      const pubKeyDer = importPublicKey(base64urlDecode(resolved.publicKey));
      const sigBytes = base64urlDecode(sig);

      const valid = verify(null, Buffer.from(payload, 'utf8'), {
        key: pubKeyDer,
        format: 'der',
        type: 'spki',
      }, sigBytes);

      if (valid) {
        const trustLevel: VvsTrustLevel = method === 'embedded' ? 'PARTIAL' : 'VERIFIED';
        return { trustLevel, agentId, keyVersion: resolved.keyVersion, keySource: method as any };
      }
    } catch {
      continue;
    }
  }

  return { trustLevel: 'FAILED', agentId, error: 'All verification methods exhausted' };
}
