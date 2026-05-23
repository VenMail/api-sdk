import {
  CreatePartnerAccountInput,
  PartnerAccount,
  PartnerApiEnvelope,
  PartnerApiError,
  PartnerAuthData,
  PartnerClientOptions,
  PartnerDnsRecords,
  PartnerHealth,
  PartnerIdentification,
  PartnerInfo,
  PartnerLoginInput,
  PartnerPlan,
  PartnerSignupInput,
  PartnerSsoData,
  PartnerSubscriptionMode,
  PartnerUsage,
  PartnerVerificationStatus,
  PartnerWalletTransactions,
  WalletTransactionsParams,
} from "./types.js";

const API_PATH = "/api/v1/provisioning";
const DEFAULT_BASE_URL = "https://m.venmail.io";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;
const BACKOFF_BASE_MS = 200;

export class PartnerClient {
  private apiKey?: string;
  private readonly baseUrl: string;
  private readonly platform: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(options: PartnerClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.platform = options.platform ?? "custom";
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error(
        "PartnerClient: fetch is not available. Pass a fetch implementation via options.fetch (Node 18+ has fetch globally).",
      );
    }
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = options.retries ?? DEFAULT_RETRIES;
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  async partnerSignup(input: PartnerSignupInput): Promise<PartnerApiEnvelope<PartnerAuthData>> {
    const response = await this.request<PartnerApiEnvelope<PartnerAuthData>>(
      "POST",
      "/auth/signup",
      input,
      false,
    );
    if (response.data?.api_key) {
      this.apiKey = response.data.api_key;
    }
    return response;
  }

  async partnerLogin(input: PartnerLoginInput): Promise<PartnerApiEnvelope<PartnerAuthData>> {
    const response = await this.request<PartnerApiEnvelope<PartnerAuthData>>(
      "POST",
      "/auth/login",
      input,
      false,
    );
    if (response.data?.api_key) {
      this.apiKey = response.data.api_key;
    }
    return response;
  }

  async identifyPartner(domain: string): Promise<PartnerApiEnvelope<PartnerIdentification>> {
    return this.request<PartnerApiEnvelope<PartnerIdentification>>(
      "POST",
      "/auth/identify",
      { domain },
      false,
    );
  }

  async getPartnerInfo(): Promise<PartnerApiEnvelope<PartnerInfo>> {
    return this.request<PartnerApiEnvelope<PartnerInfo>>("GET", "/partner");
  }

  async getPlans(): Promise<PartnerApiEnvelope<PartnerPlan[]>> {
    return this.request<PartnerApiEnvelope<PartnerPlan[]>>("GET", "/plans");
  }

  async createAccount(
    input: CreatePartnerAccountInput,
  ): Promise<PartnerApiEnvelope<PartnerAccount>> {
    return this.request<PartnerApiEnvelope<PartnerAccount>>("POST", "/accounts", {
      ...input,
      platform: input.platform ?? this.platform,
    });
  }

  async getAccount(domain: string): Promise<PartnerApiEnvelope<PartnerAccount>> {
    return this.request<PartnerApiEnvelope<PartnerAccount>>(
      "GET",
      `/accounts/${encodeURIComponent(domain)}`,
    );
  }

  async suspendAccount(domain: string): Promise<PartnerApiEnvelope> {
    return this.request<PartnerApiEnvelope>(
      "POST",
      `/accounts/${encodeURIComponent(domain)}/suspend`,
    );
  }

  async unsuspendAccount(domain: string): Promise<PartnerApiEnvelope> {
    return this.request<PartnerApiEnvelope>(
      "POST",
      `/accounts/${encodeURIComponent(domain)}/unsuspend`,
    );
  }

  async terminateAccount(domain: string): Promise<PartnerApiEnvelope> {
    return this.request<PartnerApiEnvelope>(
      "POST",
      `/accounts/${encodeURIComponent(domain)}/terminate`,
    );
  }

  async changePlan(
    domain: string,
    planId: number,
    subscriptionMode: PartnerSubscriptionMode = "monthly",
  ): Promise<PartnerApiEnvelope<Partial<PartnerAccount>>> {
    return this.request<PartnerApiEnvelope<Partial<PartnerAccount>>>(
      "PUT",
      `/accounts/${encodeURIComponent(domain)}/plan`,
      {
        plan_id: planId,
        subscription_mode: subscriptionMode,
      },
    );
  }

  async getDnsRecords(domain: string): Promise<PartnerApiEnvelope<PartnerDnsRecords>> {
    return this.request<PartnerApiEnvelope<PartnerDnsRecords>>(
      "GET",
      `/accounts/${encodeURIComponent(domain)}/dns-records`,
    );
  }

  async verifyDomain(domain: string): Promise<PartnerVerificationStatus> {
    return this.request<PartnerVerificationStatus>(
      "POST",
      `/accounts/${encodeURIComponent(domain)}/verify`,
    );
  }

  async getUsage(domain: string): Promise<PartnerApiEnvelope<PartnerUsage>> {
    return this.request<PartnerApiEnvelope<PartnerUsage>>(
      "GET",
      `/accounts/${encodeURIComponent(domain)}/usage`,
    );
  }

  async getSsoUrl(domain: string): Promise<PartnerApiEnvelope<PartnerSsoData>> {
    return this.request<PartnerApiEnvelope<PartnerSsoData>>(
      "POST",
      `/sso/${encodeURIComponent(domain)}`,
    );
  }

  async health(): Promise<PartnerHealth> {
    return this.request<PartnerHealth>("GET", "/health");
  }

  async getWalletTransactions(
    params: WalletTransactionsParams = {},
  ): Promise<PartnerApiEnvelope<PartnerWalletTransactions>> {
    const qs = new URLSearchParams();
    if (params.perPage !== undefined) qs.set("per_page", String(params.perPage));
    if (params.page !== undefined) qs.set("page", String(params.page));
    const query = qs.toString();
    return this.request<PartnerApiEnvelope<PartnerWalletTransactions>>(
      "GET",
      `/wallet/transactions${query ? `?${query}` : ""}`,
    );
  }

  async regenerateApiKey(): Promise<PartnerApiEnvelope<{ api_key: string }>> {
    const response = await this.request<PartnerApiEnvelope<{ api_key: string }>>(
      "POST",
      "/auth/regenerate-key",
    );
    if (response.data?.api_key) {
      this.apiKey = response.data.api_key;
    }
    return response;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    authenticated = true,
  ): Promise<T> {
    if (authenticated && !this.apiKey) {
      throw new Error("PartnerClient: apiKey is required for authenticated provisioning requests");
    }

    const url = `${this.baseUrl}${API_PATH}${path}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Platform": this.platform,
    };
    if (authenticated && this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let lastError: unknown;
    const maxAttempts = Math.max(1, this.retries + 1);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        clearTimeout(timer);

        const text = await res.text();
        let data: unknown = null;
        if (text.length > 0) {
          try {
            data = JSON.parse(text);
          } catch {
            data = text;
          }
        }

        if (res.ok) {
          return data as T;
        }

        if (this.isRetryableStatus(res.status) && attempt < maxAttempts - 1) {
          await sleep(backoffMs(attempt));
          continue;
        }

        const message = this.extractErrorMessage(data) || `HTTP ${res.status}`;
        throw new PartnerApiError(message, res.status, data);
      } catch (e) {
        clearTimeout(timer);

        if (e instanceof PartnerApiError) throw e;

        lastError = e;
        if (attempt < maxAttempts - 1) {
          await sleep(backoffMs(attempt));
          continue;
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`PartnerClient request failed: ${String(lastError)}`);
  }

  private isRetryableStatus(status: number): boolean {
    return status === 502 || status === 503 || status === 504;
  }

  private extractErrorMessage(data: unknown): string | null {
    if (!data || typeof data !== "object") return null;
    const obj = data as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error === "string") return obj.error;
    if (obj.message && typeof obj.message === "object") {
      return JSON.stringify(obj.message);
    }
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return BACKOFF_BASE_MS * Math.pow(2, attempt) + Math.floor(Math.random() * BACKOFF_BASE_MS);
}
