import { signMessage } from '../src/vvs/sign';
import { verifyMessage } from '../src/vvs/verify';
import { generateKeyPair } from '../src/vvs/keys';

describe('VVS Sign and Verify', () => {
  const emailHeaders = {
    from: 'billing@example.com',
    to: 'vendor@external.com',
    subject: 'Invoice #8821',
    date: 'Mon, 30 Mar 2026 12:00:00 +0000',
  };
  const body = 'Please process invoice #8821 for $5,000 USD.';

  it('sign then verify round trip with embedded key', async () => {
    const kp = generateKeyPair();
    const result = signMessage(body, emailHeaders, {
      agentId: 'billing@example.com',
      privateKey: kp.privateKey,
      verifyMethods: ['embedded'],
      publicKey: kp.publicKeyBase64url,
    });

    expect(result.headers['X-Venmail-Agent']).toBe('billing@example.com');
    expect(result.headers['X-Venmail-Algorithm']).toBe('ed25519');
    expect(result.headers['X-Venmail-Nonce']).toHaveLength(32);
    expect(result.headers['X-Venmail-Content-Hash']).toMatch(/^sha256=/);

    const verifyResult = await verifyMessage(
      { ...result.headers } as Record<string, string>,
      body,
      emailHeaders,
      { timestampWindow: 60 }
    );

    expect(verifyResult.trustLevel).toBe('PARTIAL'); // embedded = PARTIAL
    expect(verifyResult.agentId).toBe('billing@example.com');
  });

  it('detects tampered body', async () => {
    const kp = generateKeyPair();
    const result = signMessage(body, emailHeaders, {
      agentId: 'billing@example.com',
      privateKey: kp.privateKey,
      verifyMethods: ['embedded'],
      publicKey: kp.publicKeyBase64url,
    });

    const verifyResult = await verifyMessage(
      { ...result.headers } as Record<string, string>,
      body + ' TAMPERED',
      emailHeaders,
      { timestampWindow: 60 }
    );

    expect(verifyResult.trustLevel).toBe('FAILED');
    expect(verifyResult.error).toContain('Content hash mismatch');
  });

  it('returns UNKNOWN for messages without VVS headers', async () => {
    const result = await verifyMessage({}, body, emailHeaders);
    expect(result.trustLevel).toBe('UNKNOWN');
  });

  it('rejects missing required headers', async () => {
    const result = await verifyMessage(
      { 'X-Venmail-Agent': 'test@example.com' },
      body,
      emailHeaders
    );
    expect(result.trustLevel).toBe('FAILED');
    expect(result.error).toContain('Missing required VVS headers');
  });
});
