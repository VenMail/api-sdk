/// <reference types="jest" />

import { PartnerApiError, PartnerClient } from "../src/index";

function makeFetch(
  responses: Array<{ status: number; body?: unknown }>,
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

describe("PartnerClient", () => {
  const baseUrl = "https://m.venmail.test";
  const apiKey = "partner_test_key";

  it("signs up without bearer auth and stores returned api key", async () => {
    const { fetchImpl, calls } = makeFetch([
      {
        status: 201,
        body: {
          success: true,
          data: {
            partner_id: 1,
            name: "Suyarun",
            api_key: apiKey,
            reseller_domain: "run.suya.surf",
          },
        },
      },
    ]);

    const client = new PartnerClient({ baseUrl, fetch: fetchImpl, retries: 0 });
    const response = await client.partnerSignup({
      email: "owner@example.com",
      password: "secret123",
      name: "Owner Example",
      company: "Suyarun",
      platform_type: "custom",
      reseller_domain: "run.suya.surf",
    });

    expect(response.data?.partner_id).toBe(1);
    expect(client.getApiKey()).toBe(apiKey);
    expect(calls[0].url).toBe(`${baseUrl}/api/v1/provisioning/auth/signup`);
    const headers = (calls[0].init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("creates startup accounts with bearer auth and platform metadata", async () => {
    const { fetchImpl, calls } = makeFetch([
      {
        status: 201,
        body: {
          success: true,
          data: {
            domain: "customer.com",
            domain_id: 10,
            organization_id: 20,
            user_id: 30,
            plan: "Startup",
          },
        },
      },
    ]);
    const client = new PartnerClient({
      baseUrl,
      apiKey,
      platform: "suyarun",
      fetch: fetchImpl,
      retries: 0,
    });

    await client.createAccount({
      email: "admin@customer.com",
      fullName: "Customer Admin",
      domain: "customer.com",
      organization: "Customer Inc",
      plan_id: 1,
      subscription_mode: "monthly",
    });

    expect(calls[0].url).toBe(`${baseUrl}/api/v1/provisioning/accounts`);
    const headers = (calls[0].init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${apiKey}`);
    expect(headers["X-Platform"]).toBe("suyarun");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      email: "admin@customer.com",
      fullName: "Customer Admin",
      domain: "customer.com",
      organization: "Customer Inc",
      plan_id: 1,
      subscription_mode: "monthly",
      platform: "suyarun",
    });
  });

  it("builds account DNS and wallet URLs", async () => {
    const { fetchImpl, calls } = makeFetch([
      { status: 200, body: { success: true, data: { domain: "customer.com", records: [] } } },
      { status: 200, body: { success: true, data: [] } },
    ]);
    const client = new PartnerClient({ baseUrl, apiKey, fetch: fetchImpl, retries: 0 });

    await client.getDnsRecords("customer.com");
    await client.getWalletTransactions({ perPage: 5, page: 2 });

    expect(calls[0].url).toBe(
      `${baseUrl}/api/v1/provisioning/accounts/customer.com/dns-records`,
    );
    expect(calls[1].url).toBe(
      `${baseUrl}/api/v1/provisioning/wallet/transactions?per_page=5&page=2`,
    );
  });

  it("requires an api key for authenticated methods", async () => {
    const { fetchImpl } = makeFetch([{ status: 200, body: { success: true, data: [] } }]);
    const client = new PartnerClient({ baseUrl, fetch: fetchImpl, retries: 0 });

    await expect(client.getPlans()).rejects.toThrow(/apiKey/);
  });

  it("throws PartnerApiError with server message on 4xx", async () => {
    const { fetchImpl } = makeFetch([
      { status: 409, body: { success: false, message: { domain: "Domain already exists" } } },
    ]);
    const client = new PartnerClient({ baseUrl, apiKey, fetch: fetchImpl, retries: 0 });

    await expect(client.getAccount("customer.com")).rejects.toBeInstanceOf(PartnerApiError);
    await expect(client.getAccount("customer.com")).rejects.toMatchObject({
      status: 409,
      message: "{\"domain\":\"Domain already exists\"}",
    });
  });
});
