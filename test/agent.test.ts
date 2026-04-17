/// <reference types="jest" />

import { AgentClient, AgentApiError } from "../src/index";

/**
 * Mock fetch factory — returns a fetch replacement that serves canned
 * responses in order and records all requests for assertion.
 */
function makeFetch(
  responses: Array<{ status: number; body?: unknown }>
): { fetchImpl: typeof fetch; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const fetchImpl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const next = responses[Math.min(i, responses.length - 1)];
    i++;
    const body = next.body === undefined ? "" : JSON.stringify(next.body);
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("AgentClient", () => {
  const baseUrl = "https://mail.example.com";
  const token = "ma-vm_abcd1234_secretsecretsecretsecretsecret12";

  it("sends bearer token on GET /me", async () => {
    const { fetchImpl, calls } = makeFetch([
      {
        status: 200,
        body: {
          inbox: {
            id: "1-xxxx",
            email: "a@b.com",
            name: "A B",
            kind: "human",
            organization_id: 1,
          },
          token: { name: "t", prefix: "ma-vm_abcd1234", scopes: null, last_used_at: null, expires_at: null },
        },
      },
    ]);
    const client = new AgentClient({ baseUrl, token, fetch: fetchImpl, retries: 0 });
    const me = await client.me();

    expect(me.inbox.email).toBe("a@b.com");
    expect(calls[0].url).toBe(`${baseUrl}/api/v1/agent/me`);
    const headers = (calls[0].init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${token}`);
    expect(headers.Accept).toBe("application/json");
  });

  it("builds query string for listThreads", async () => {
    const { fetchImpl, calls } = makeFetch([
      { status: 200, body: { data: [], next_cursor: null, folder: "inbox" } },
    ]);
    const client = new AgentClient({ baseUrl, token, fetch: fetchImpl, retries: 0 });
    await client.listThreads({ folder: "inbox", limit: 10, q: "deck" });
    expect(calls[0].url).toBe(
      `${baseUrl}/api/v1/agent/threads?folder=inbox&limit=10&q=deck`
    );
  });

  it("throws AgentApiError with server message on 4xx", async () => {
    const { fetchImpl } = makeFetch([
      { status: 403, body: { success: false, message: "Token missing scope: inbox:read" } },
    ]);
    const client = new AgentClient({ baseUrl, token, fetch: fetchImpl, retries: 0 });

    await expect(client.listThreads()).rejects.toBeInstanceOf(AgentApiError);
    await expect(client.listThreads()).rejects.toMatchObject({
      status: 403,
      message: "Token missing scope: inbox:read",
    });
  });

  it("does not retry on 4xx", async () => {
    const { fetchImpl, calls } = makeFetch([
      { status: 401, body: { message: "Missing bearer token" } },
    ]);
    const client = new AgentClient({ baseUrl, token, fetch: fetchImpl, retries: 3 });
    await expect(client.me()).rejects.toBeInstanceOf(AgentApiError);
    expect(calls.length).toBe(1);
  });

  it("retries transient 5xx up to the configured limit", async () => {
    const { fetchImpl, calls } = makeFetch([
      { status: 503, body: { message: "service unavailable" } },
      { status: 503, body: { message: "service unavailable" } },
      { status: 200, body: { success: true } },
    ]);
    const client = new AgentClient({ baseUrl, token, fetch: fetchImpl, retries: 2 });
    const res = await client.markThreadRead("1-xyz");
    expect(res).toEqual({ success: true });
    expect(calls.length).toBe(3);
  });

  it("refreshToken rotates internal token and fires callback", async () => {
    const newToken = "ma-vm_efgh5678_" + "x".repeat(32);
    const { fetchImpl, calls } = makeFetch([
      {
        status: 200,
        body: {
          access_token: newToken,
          prefix: "ma-vm_efgh5678",
          scopes: ["inbox:read", "mail:send"],
          expires_at: null,
        },
      },
      { status: 200, body: { success: true } },
    ]);
    let refreshed: string | null = null;
    const client = new AgentClient({
      baseUrl,
      token,
      fetch: fetchImpl,
      retries: 0,
      onTokenRefreshed: (t) => (refreshed = t),
    });

    await client.refreshToken();
    expect(refreshed).toBe(newToken);
    expect(client.getToken()).toBe(newToken);

    // Subsequent call uses the new token.
    await client.markThreadRead("1-xyz");
    const secondHeaders = (calls[1].init.headers ?? {}) as Record<string, string>;
    expect(secondHeaders.Authorization).toBe(`Bearer ${newToken}`);
  });

  it("serializes request body as JSON on sendMessage", async () => {
    const { fetchImpl, calls } = makeFetch([{ status: 200, body: { success: true } }]);
    const client = new AgentClient({ baseUrl, token, fetch: fetchImpl, retries: 0 });

    await client.sendMessage({
      to: "alice@example.com",
      subject: "Hello",
      body: "Hi Alice",
    });

    const call = calls[0];
    expect(call.init.method).toBe("POST");
    const headers = (call.init.headers ?? {}) as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    const payload = JSON.parse(call.init.body as string);
    expect(payload).toEqual({
      to: "alice@example.com",
      subject: "Hello",
      body: "Hi Alice",
    });
  });

  it("rejects construction without baseUrl or token", () => {
    // @ts-expect-error intentional
    expect(() => new AgentClient({ token: "x" })).toThrow(/baseUrl/);
    // @ts-expect-error intentional
    expect(() => new AgentClient({ baseUrl: "x" })).toThrow(/token/);
  });

  it("trims trailing slashes from baseUrl", async () => {
    const { fetchImpl, calls } = makeFetch([{ status: 200, body: { inbox: {}, token: {} } }]);
    const client = new AgentClient({
      baseUrl: "https://mail.example.com////",
      token,
      fetch: fetchImpl,
      retries: 0,
    });
    await client.me();
    expect(calls[0].url).toBe("https://mail.example.com/api/v1/agent/me");
  });
});
