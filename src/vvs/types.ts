export type VvsTrustLevel = 'VERIFIED' | 'PARTIAL' | 'FAILED' | 'UNKNOWN';

export interface VvsHeaders {
  'X-Venmail-Agent': string;
  'X-Venmail-Signature': string;
  'X-Venmail-Algorithm': string;
  'X-Venmail-Timestamp': string;
  'X-Venmail-Nonce': string;
  'X-Venmail-Content-Hash': string;
  'X-Venmail-Verify-Method': string;
  'X-Venmail-Public-Key'?: string;
  'X-Venmail-Key-Version'?: string;
  'X-Venmail-Context'?: string;
}

export interface VvsKeyPair {
  publicKey: Buffer;
  privateKey: Buffer;
  publicKeyBase64url: string;
}

export interface VvsSignResult {
  headers: VvsHeaders;
  canonicalPayload: string;
  contentHash: string;
}

export interface VvsVerifyResult {
  trustLevel: VvsTrustLevel;
  agentId?: string;
  keyVersion?: number;
  keySource?: 'well-known' | 'dns' | 'embedded';
  error?: string;
}

export interface VvsAgentRecord {
  agent_id: string;
  public_key: string;
  key_version: number;
  status: 'active' | 'rotated' | 'revoked' | 'suspended';
  algorithm?: string;
  valid_from?: string;
  valid_until?: string | null;
}

export interface VvsSignOptions {
  agentId: string;
  privateKey: Buffer;
  verifyMethods?: string[];
  keyVersion?: number;
  publicKey?: string;
  context?: string;
}
