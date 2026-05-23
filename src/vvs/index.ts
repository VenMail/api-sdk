export { canonicalizeBody, canonicalizeHeaders, buildCanonicalPayload } from './canonicalize.js';
export { computeContentHash, base64urlEncode, base64urlDecode } from './hash.js';
export { signMessage, generateNonce } from './sign.js';
export { verifyMessage } from './verify.js';
export type { VerifyOptions } from './verify.js';
export { resolveKey } from './resolve.js';
export { generateKeyPair, importPrivateKey, importPublicKey } from './keys.js';
export type {
  VvsTrustLevel,
  VvsHeaders,
  VvsKeyPair,
  VvsSignResult,
  VvsVerifyResult,
  VvsAgentRecord,
  VvsSignOptions,
} from './types.js';
