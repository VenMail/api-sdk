import { generateKeyPair } from '../src/vvs/keys';

describe('VVS Key Generation', () => {
  it('generates a valid keypair', () => {
    const kp = generateKeyPair();
    expect(kp.publicKey).toBeInstanceOf(Buffer);
    expect(kp.publicKey.length).toBe(32);
    expect(kp.privateKey).toBeInstanceOf(Buffer);
    expect(kp.privateKey.length).toBeGreaterThan(32); // DER-encoded
    expect(typeof kp.publicKeyBase64url).toBe('string');
    expect(kp.publicKeyBase64url.length).toBeGreaterThan(0);
  });

  it('generates unique keypairs', () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    expect(kp1.publicKeyBase64url).not.toBe(kp2.publicKeyBase64url);
  });

  it('public key base64url has no padding', () => {
    const kp = generateKeyPair();
    expect(kp.publicKeyBase64url).not.toContain('=');
    expect(kp.publicKeyBase64url).not.toContain('+');
    expect(kp.publicKeyBase64url).not.toContain('/');
  });
});
