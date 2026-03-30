import { generateKeyPairSync } from 'crypto';
import { base64urlEncode } from './hash';
import type { VvsKeyPair } from './types';

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Generate a new Ed25519 keypair for VVS-1 signing
 */
export function generateKeyPair(): VvsKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  const rawPublic = publicKey.subarray(-32);

  return {
    publicKey: rawPublic,
    privateKey: Buffer.from(privateKey),
    publicKeyBase64url: base64urlEncode(rawPublic),
  };
}

/**
 * Import an Ed25519 private key from raw 32 bytes into PKCS8 DER
 */
export function importPrivateKey(raw: Buffer): Buffer {
  return Buffer.concat([PKCS8_PREFIX, raw]);
}

/**
 * Import an Ed25519 public key from raw 32 bytes into SPKI DER
 */
export function importPublicKey(raw: Buffer): Buffer {
  return Buffer.concat([SPKI_PREFIX, raw]);
}
