export type PartnerPlatformType = "whmcs" | "cpanel" | "plesk" | "directadmin" | "custom";
export type PartnerSubscriptionMode = "monthly" | "yearly";

export interface PartnerClientOptions {
  /** Full origin, e.g. "https://m.venmail.io". Defaults to the Venmail partner app. */
  baseUrl?: string;
  /** Partner provisioning API key. Required for authenticated methods. */
  apiKey?: string;
  /** Platform identifier sent as X-Platform and account metadata. Defaults to "custom". */
  platform?: PartnerPlatformType | string;
  /** Optional fetch override for tests or custom runtimes. */
  fetch?: typeof fetch;
  /** Optional per-request timeout in milliseconds. Defaults to 30s. */
  timeoutMs?: number;
  /** Optional retry count for transient 5xx/network errors. Defaults to 2. */
  retries?: number;
}

export interface PartnerApiEnvelope<TData = unknown> {
  success: boolean;
  message?: string | Record<string, unknown>;
  data?: TData;
  [key: string]: unknown;
}

export interface PartnerSignupInput {
  email: string;
  password: string;
  name: string;
  company: string;
  reseller_domain?: string;
  platform_type?: PartnerPlatformType | string;
  website?: string;
}

export interface PartnerLoginInput {
  email: string;
  password: string;
}

export interface PartnerAuthData {
  partner_id: number;
  name: string;
  api_key: string;
  reseller_domain?: string | null;
  credit_balance?: number | string;
  currency?: string;
  platform_type?: string | null;
  oauth_client_id?: string;
  oauth_client_secret?: string;
}

export interface PartnerIdentification {
  partner_id: number;
  name: string;
  reseller_domain: string | null;
  platform_type: string | null;
  login_url?: string;
  signup_url?: string;
  has_api_key?: boolean;
}

export interface PartnerPlan {
  id: number;
  name: string;
  monthly_price?: number | string | null;
  yearly_price?: number | string | null;
  currency?: string;
  storage_limit?: number | string | null;
  email_limit?: number | string | null;
}

export interface CreatePartnerAccountInput {
  email: string;
  fullName: string;
  domain: string;
  organization: string;
  password?: string;
  plan_id?: number;
  subscription_mode?: PartnerSubscriptionMode;
  platform?: string;
  registrar?: string;
}

export interface PartnerAccount {
  domain: string;
  domain_id: number;
  organization_id: number;
  organization_name?: string;
  user_id?: number;
  plan?: string | null;
  plan_id?: number | null;
  is_active?: boolean;
  subscription_mode?: string | null;
  subscription_ends_at?: string | null;
  verification?: {
    cname_verified: boolean;
    dkim_verified: boolean;
    fully_verified: boolean;
  };
  backend?: string;
  created_at?: string | null;
}

export interface PartnerDnsRecord {
  type: string;
  name: string;
  value: string;
  purpose?: string;
  required?: boolean;
  priority?: number | string;
}

export interface PartnerDnsRecords {
  domain: string;
  backend: string;
  records: PartnerDnsRecord[];
}

export interface PartnerVerificationStatus {
  success: boolean;
  backend?: string;
  status?: unknown;
  message?: string | Record<string, unknown>;
}

export interface PartnerUsage {
  domain: string;
  stats: Array<{
    month: number;
    year: number;
    emails_sent: number;
    emails_received: number;
  }>;
}

export interface PartnerSsoData {
  sso_url: string;
  token: string;
  expires_in: number;
}

export interface PartnerInfo {
  partner_id: number;
  name: string;
  credit_balance: number | string;
  currency: string;
  post_paid?: boolean;
  billing_period?: string;
  platform_type?: string | null;
  preferred_plan_id?: number | null;
  organizations_count?: number;
  balance_notification?: number;
}

export interface WalletTransactionsParams {
  perPage?: number;
  page?: number;
}

export interface PartnerWalletTransaction {
  id?: number;
  amount?: number | string;
  type?: string;
  narration?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface PartnerWalletTransactions {
  data?: PartnerWalletTransaction[];
  meta?: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
  [key: string]: unknown;
}

export interface PartnerHealth {
  success: boolean;
  message: string;
  version: string;
  timestamp: string;
}

export class PartnerApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "PartnerApiError";
    this.status = status;
    this.body = body;
  }
}
