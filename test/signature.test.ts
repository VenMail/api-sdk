/// <reference types="jest" />

import { verifyVenmailSignature, verifySharedSecretHeader } from '../src/index';

describe('Signature Verification', () => {
  const secret = 'test-secret-key';
  const payload = JSON.stringify({ test: 'data' });

  it('should verify valid HMAC signature', () => {
    const crypto = require('crypto');
    const signature = crypto
      .createHmac('sha256', Buffer.from(secret, 'utf8'))
      .update(Buffer.from(payload, 'utf8'))
      .digest('hex');

    const isValid = verifyVenmailSignature({
      secret,
      signature,
      rawBody: payload,
    });

    expect(isValid).toBe(true);
  });

  it('should reject invalid signature', () => {
    const isValid = verifyVenmailSignature({
      secret,
      signature: 'invalid-signature',
      rawBody: payload,
    });

    expect(isValid).toBe(false);
  });

  it('should handle missing signature', () => {
    const isValid = verifyVenmailSignature({
      secret,
      signature: '',
      rawBody: payload,
    });

    expect(isValid).toBe(false);
  });
});

describe('Shared Secret Verification', () => {
  const secret = 'shared-secret-value';

  it('should verify correct shared secret', () => {
    const isValid = verifySharedSecretHeader({
      secret,
      provided: secret,
    });

    expect(isValid).toBe(true);
  });

  it('should reject incorrect shared secret', () => {
    const isValid = verifySharedSecretHeader({
      secret,
      provided: 'wrong-secret',
    });

    expect(isValid).toBe(false);
  });

  it('should handle missing secret header', () => {
    const isValid = verifySharedSecretHeader({
      secret,
      provided: null,
    });

    expect(isValid).toBe(false);
  });
});
