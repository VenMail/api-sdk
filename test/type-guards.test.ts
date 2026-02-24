/// <reference types="jest" />

import {
  detectVenmailWebhookKind,
  isMailWebhookPayload,
  isStatusPayload,
  isBouncePayload,
  normalizeDeliveryEvent,
  type VenmailMailWebhookPayload,
  type VenmailStatusWebhookPayload,
} from '../src/index';

describe('Type Guards', () => {
  describe('detectVenmailWebhookKind', () => {
    it('should detect integration events', () => {
      const payload = {
        event_type: 'MailReceived',
        generated_at: '2024-01-01T00:00:00Z',
        payload: {},
        event_id: 123,
        organization_id: 456,
        integration_id: 789,
      };

      const result = detectVenmailWebhookKind(payload);
      expect(result.kind).toBe('integration');
    });

    it('should detect mail webhooks', () => {
      const payload = {
        message_id: 'test-message-id',
        rcpt_to: 'test@example.com',
        to: 'test@example.com',
        from: 'sender@example.com',
      };

      const result = detectVenmailWebhookKind(payload);
      expect(result.kind).toBe('mail');
    });

    it('should detect status events', () => {
      const payload = {
        status: 'MessageDelivered',
        message: {
          message_id: 'test-message-id',
          to: 'test@example.com',
          tag: 'campaign:123',
        },
      };

      const result = detectVenmailWebhookKind(payload);
      expect(result.kind).toBe('status');
      expect(result.isCampaignEvent).toBe(true);
      expect(result.campaignId).toBe('123');
    });

    it('should detect bounce events', () => {
      const payload = {
        original_message: {
          message_id: 'test-message-id',
          to: 'test@example.com',
        },
        bounce: {
          type: 'permanent',
          reason: 'User unknown',
        },
      };

      const result = detectVenmailWebhookKind(payload);
      expect(result.kind).toBe('bounce');
    });

    it('should detect unknown payloads', () => {
      const payload = { random: 'data' };
      const result = detectVenmailWebhookKind(payload);
      expect(result.kind).toBe('unknown');
    });
  });

  describe('isMailWebhookPayload', () => {
    it('should identify valid mail payloads', () => {
      const payload: VenmailMailWebhookPayload = {
        message_id: 'test-id',
        rcpt_to: 'test@example.com',
        to: 'test@example.com',
        from: 'sender@example.com',
      };

      expect(isMailWebhookPayload(payload)).toBe(true);
    });

    it('should reject invalid mail payloads', () => {
      expect(isMailWebhookPayload({})).toBe(false);
      expect(isMailWebhookPayload({ message_id: 'test' })).toBe(false);
      expect(isMailWebhookPayload({ rcpt_to: 'test' })).toBe(false);
    });
  });

  describe('isStatusPayload', () => {
    it('should identify valid status payloads', () => {
      const payload: VenmailStatusWebhookPayload = {
        status: 'MessageDelivered',
        message: {
          message_id: 'test-id',
          to: 'test@example.com',
        },
      };

      expect(isStatusPayload(payload)).toBe(true);
    });

    it('should reject invalid status payloads', () => {
      expect(isStatusPayload({})).toBe(false);
      expect(isStatusPayload({ status: 'test' })).toBe(false);
    });
  });

  describe('isBouncePayload', () => {
    it('should identify valid bounce payloads', () => {
      const payload = {
        original_message: {
          message_id: 'test-id',
          to: 'test@example.com',
        },
        bounce: {
          type: 'permanent',
          reason: 'User unknown',
        },
      };

      expect(isBouncePayload(payload)).toBe(true);
    });

    it('should reject invalid bounce payloads', () => {
      expect(isBouncePayload({})).toBe(false);
      expect(isBouncePayload({ original_message: {} })).toBe(false);
    });
  });

  describe('normalizeDeliveryEvent', () => {
    it('should normalize status events', () => {
      const payload: VenmailStatusWebhookPayload = {
        status: 'MessageDelivered',
        message: {
          message_id: 'test-id',
          to: 'test@example.com',
          tag: 'campaign:123',
        },
      };

      const normalized = normalizeDeliveryEvent(payload);
      expect(normalized.messageId).toBe('test-id');
      expect(normalized.recipient).toBe('test@example.com');
      expect(normalized.status).toBe('MessageDelivered');
      expect(normalized.campaignId).toBe('123');
    });

    it('should normalize bounce events', () => {
      const payload = {
        original_message: {
          message_id: 'test-id',
          to: 'test@example.com',
          tag: 'campaign:456',
        },
        bounce: {
          type: 'permanent',
          reason: 'User unknown',
        },
      };

      const normalized = normalizeDeliveryEvent(payload);
      expect(normalized.messageId).toBe('test-id');
      expect(normalized.recipient).toBe('test@example.com');
      expect(normalized.status).toBe('MessageBounced');
      expect(normalized.campaignId).toBe('456');
    });
  });
});
