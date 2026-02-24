/// <reference types="jest" />

import express from 'express';
import { venmailIntegrationWebhook, type VenmailIntegrationEvent } from '../src/index';

describe('Integration Tests', () => {
  let app: express.Application;
  let server: any;

  beforeAll(() => {
    app = express();
    app.use(express.json({ type: "application/json" }));

    const receivedEvents: VenmailIntegrationEvent[] = [];

    app.post(
      "/webhooks/venmail",
      venmailIntegrationWebhook({
        secret: "test-secret",
        async onEvent(event: VenmailIntegrationEvent) {
          receivedEvents.push(event);
        },
        autoRespond: false,
      })
    );

    app.get('/test/events', (req, res) => {
      res.json(receivedEvents);
    });

    server = app.listen(0);
  });

  afterAll(() => {
    if (server) {
      server.close();
    }
  });

  it('should handle valid webhook with signature', async () => {
    const crypto = require('crypto');
    const payload = {
      event_type: 'MailReceived',
      generated_at: '2024-01-01T00:00:00Z',
      payload: { test: 'data' },
      event_id: 123,
      organization_id: 456,
      integration_id: 789,
    };
    
    const body = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', Buffer.from('test-secret', 'utf8'))
      .update(Buffer.from(body, 'utf8'))
      .digest('hex');

    const response = await fetch(`http://localhost:${server.address().port}/webhooks/venmail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-venmail-signature': signature,
        'x-venmail-event': 'MailReceived',
      },
      body,
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.ok).toBe(true);
  }, 10000);

  it('should reject invalid signature', async () => {
    const payload = {
      event_type: 'MailReceived',
      generated_at: '2024-01-01T00:00:00Z',
      payload: { test: 'data' },
      event_id: 123,
      organization_id: 456,
      integration_id: 789,
    };

    const response = await fetch(`http://localhost:${server.address().port}/webhooks/venmail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-venmail-signature': 'invalid-signature',
        'x-venmail-event': 'MailReceived',
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(401);
    const result = await response.json();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Invalid Venmail signature');
  });
});
