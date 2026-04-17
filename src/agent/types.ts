/**
 * Venmail Agent API types — shape of requests and responses for the
 * bearer-authenticated REST API that powers external AI agents.
 *
 * These types mirror the backend definitions in
 * app/Http/Controllers/Api/AgentApiController.php and should stay in lockstep
 * with that contract.
 */

export type GrammarIssueType = "grammar" | "spelling" | "style" | "clarity" | "tone";

export type AgentScope =
  | "inbox:read"
  | "thread:read"
  | "mail:send"
  | "mail:mark_read"
  | "*";

export type AgentFolder =
  | "inbox"
  | "sent"
  | "draft"
  | "archive"
  | "trash"
  | "spam"
  | "starred"
  | "snoozed";

export interface AgentIdentity {
  inbox: {
    id: string;
    email: string;
    name: string;
    kind: "human" | "ai_agent" | "shared";
    organization_id: number;
  };
  token: {
    name: string;
    prefix: string;
    scopes: AgentScope[] | null;
    last_used_at: string | null;
    expires_at: string | null;
  };
}

export interface AgentAddress {
  email: string | null;
  name: string | null;
}

export interface AgentThreadSummary {
  id: string;
  subject: string | null;
  from: AgentAddress;
  to: string | null;
  snippet: string;
  is_read: boolean;
  is_outgoing: boolean;
  folder_id: number;
  thread_mail_id: string | null;
  created_at: string | null;
}

export interface AgentThreadFull extends AgentThreadSummary {
  cc: string | null;
  bcc: string | null;
  plain_body: string | null;
  html_body: string | null;
  first_opened_at: string | null;
  open_count: number;
  messages?: AgentThreadFull[];
}

export interface ListThreadsParams {
  folder?: AgentFolder;
  limit?: number;
  cursor?: string;
  q?: string;
  since?: string;
}

export interface ListThreadsResponse {
  data: AgentThreadSummary[];
  next_cursor: string | null;
  folder: AgentFolder;
}

export interface SendMessageInput {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  /** Plain-text body (required). */
  body: string;
  /** Optional HTML body. */
  html?: string;
}

export interface ReplyInput {
  body: string;
  html?: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  prefix: string;
  scopes: AgentScope[] | null;
  expires_at: string | null;
}

export interface AgentClientOptions {
  /** Full origin, e.g. "https://mail.example.com". The SDK appends /api/v1/agent. */
  baseUrl: string;
  /** Bearer token ("ma-vm_..."). */
  token: string;
  /**
   * Optional fetch override (for testing or custom runtimes). Defaults to
   * globalThis.fetch which is available on Node 18+, all modern browsers,
   * Deno, Bun.
   */
  fetch?: typeof fetch;
  /** Optional per-request timeout (ms). Defaults to 30s. */
  timeoutMs?: number;
  /**
   * Optional retry count for transient errors (5xx, network).
   * Default 2. Set to 0 to disable.
   */
  retries?: number;
  /**
   * Called when the server returns a new token after a successful refresh.
   * The SDK updates its internal bearer automatically; this callback lets
   * callers persist the rotated token.
   */
  onTokenRefreshed?: (newToken: string) => void;
}

export class AgentApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "AgentApiError";
    this.status = status;
    this.body = body;
  }
}
