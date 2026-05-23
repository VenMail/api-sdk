/**
 * AgentClient — high-level TypeScript client for the Venmail Agent REST API.
 *
 * Usage:
 *   import { AgentClient } from "@venmail/vsm";
 *
 *   const client = new AgentClient({
 *     baseUrl: "https://mail.example.com",
 *     token: process.env.VENMAIL_AGENT_TOKEN!,
 *   });
 *
 *   const me = await client.me();
 *   const inbox = await client.listThreads({ folder: "inbox", limit: 10 });
 *   await client.replyToThread(inbox.data[0].id, { body: "Thanks — got it." });
 *
 * The client uses native fetch (Node 18+, browsers, Deno, Bun). No external
 * HTTP dependencies.
 */

import {
  AgentApiError,
  AgentClientOptions,
  AgentIdentity,
  AgentThreadFull,
  ListThreadsParams,
  ListThreadsResponse,
  RefreshTokenResponse,
  ReplyInput,
  SendMessageInput,
} from "./types.js";

const API_PATH = "/api/v1/agent";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;
/** Backoff jitter base (ms). Actual wait is base * 2^attempt + rand(0..base). */
const BACKOFF_BASE_MS = 200;

export class AgentClient {
  private token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly onTokenRefreshed?: (newToken: string) => void;

  constructor(options: AgentClientOptions) {
    if (!options?.baseUrl) {
      throw new Error("AgentClient: baseUrl is required");
    }
    if (!options?.token) {
      throw new Error("AgentClient: token is required");
    }

    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error(
        "AgentClient: fetch is not available. Pass a fetch implementation via options.fetch (Node 18+ has fetch globally).",
      );
    }
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.onTokenRefreshed = options.onTokenRefreshed;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Return the current token value (for persistence after refresh). */
  getToken(): string {
    return this.token;
  }

  /** Identity + scopes of the bound inbox. */
  async me(): Promise<AgentIdentity> {
    return this.request<AgentIdentity>("GET", "/me");
  }

  /** Paginated list of threads in a folder. */
  async listThreads(params: ListThreadsParams = {}): Promise<ListThreadsResponse> {
    const qs = new URLSearchParams();
    if (params.folder) qs.set("folder", params.folder);
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    if (params.cursor) qs.set("cursor", params.cursor);
    if (params.q) qs.set("q", params.q);
    if (params.since) qs.set("since", params.since);
    const query = qs.toString();
    return this.request<ListThreadsResponse>("GET", `/threads${query ? `?${query}` : ""}`);
  }

  /** Full thread with nested child messages. */
  async getThread(id: string): Promise<{ data: AgentThreadFull }> {
    return this.request<{ data: AgentThreadFull }>("GET", `/threads/${encodeURIComponent(id)}`);
  }

  /** Reply to an existing thread. */
  async replyToThread(id: string, input: ReplyInput): Promise<unknown> {
    return this.request<unknown>("POST", `/threads/${encodeURIComponent(id)}/reply`, input);
  }

  /** Mark a thread as read. Idempotent. */
  async markThreadRead(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(
      "POST",
      `/threads/${encodeURIComponent(id)}/mark-read`,
    );
  }

  /** Send a new outbound message. */
  async sendMessage(input: SendMessageInput): Promise<unknown> {
    return this.request<unknown>("POST", "/messages", input);
  }

  /**
   * Rotate the current token. Server revokes the old one and returns a
   * fresh bearer, which this client begins using for subsequent calls.
   */
  async refreshToken(): Promise<RefreshTokenResponse> {
    const res = await this.request<RefreshTokenResponse>("POST", "/token/refresh");
    if (res.access_token && res.access_token !== this.token) {
      this.token = res.access_token;
      this.onTokenRefreshed?.(res.access_token);
    }
    return res;
  }

  /** Explicitly revoke this token (irreversible). */
  async revokeToken(): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("POST", "/token/revoke");
  }

  // -----------------------------------------------------------------------
  // Transport
  // -----------------------------------------------------------------------

  /**
   * Low-level request helper with bearer auth, timeout, and light retry on
   * transient failures (5xx and network errors). 4xx failures are not retried.
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${API_PATH}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };
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

        // Retryable server errors: 502/503/504.
        if (this.isRetryableStatus(res.status) && attempt < maxAttempts - 1) {
          await sleep(backoffMs(attempt));
          continue;
        }

        const message = this.extractErrorMessage(data) || `HTTP ${res.status}`;
        throw new AgentApiError(message, res.status, data);
      } catch (e) {
        clearTimeout(timer);

        // Don't retry explicit AgentApiError (already handled above).
        if (e instanceof AgentApiError) throw e;

        lastError = e;
        if (attempt < maxAttempts - 1) {
          await sleep(backoffMs(attempt));
          continue;
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`AgentClient request failed: ${String(lastError)}`);
  }

  private isRetryableStatus(status: number): boolean {
    return status === 502 || status === 503 || status === 504;
  }

  private extractErrorMessage(data: unknown): string | null {
    if (!data || typeof data !== "object") return null;
    const obj = data as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error === "string") return obj.error;
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  return BACKOFF_BASE_MS * Math.pow(2, attempt) + Math.floor(Math.random() * BACKOFF_BASE_MS);
}
