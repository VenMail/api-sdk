export { canonicalizeBody, canonicalizeHeaders, buildCanonicalPayload } from './canonicalize';
export { computeContentHash, base64urlEncode, base64urlDecode } from './hash';
export { signMessage, generateNonce } from './sign';
export { verifyMessage } from './verify';
export type { VerifyOptions } from './verify';
export { resolveKey } from './resolve';
export { generateKeyPair, importPrivateKey, importPublicKey } from './keys';
export type {
  VvsTrustLevel,
  VvsHeaders,
  VvsKeyPair,
  VvsSignResult,
  VvsVerifyResult,
  VvsAgentRecord,
  VvsSignOptions,
} from './types';
