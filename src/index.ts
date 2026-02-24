import crypto from "node:crypto";
import type { Request, Response, RequestHandler } from "express";
import {
  VenmailIntegrationEvent,
  VenmailIntegrationEventBody,
  VenmailIntegrationEventType,
  VenmailMailWebhookPayload,
  VenmailStatusWebhookPayload,
  VenmailBounceWebhookPayload,
  VenmailWebhookRequest,
} from "./types";

const DEFAULT_SIGNATURE_HEADER = "x-venmail-signature";
const DEFAULT_EVENT_HEADER = "x-venmail-event";

export interface SignatureVerificationOptions {
  secret: string;
  signature: string;
  rawBody: Buffer | string;
  encoding?: "hex" | "base64";
}

export function verifyVenmailSignature({
  secret,
  signature,
  rawBody,
  encoding = "hex",
}: SignatureVerificationOptions): boolean {
  if (!secret) {
    throw new Error("Venmail signature validation requires a secret");
  }

  if (!signature) {
    return false;
  }

  const computed = crypto
    .createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody)
    .digest(encoding);

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, encoding),
      Buffer.from(computed, encoding)
    );
  } catch {
    return false;
  }
}

export interface SharedSecretOptions {
  secret: string;
  provided?: string | null;
}

export function verifySharedSecretHeader({
  secret,
  provided,
}: SharedSecretOptions): boolean {
  if (!secret) {
    throw new Error("Missing expected secret for header validation");
  }

  if (!provided) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(secret, "utf8"),
      Buffer.from(provided, "utf8")
    );
  } catch {
    return false;
  }
}

function resolveRawBody(req: Request, fallback?: Buffer): Buffer {
  const rawBody = (req as unknown as { rawBody?: Buffer | string }).rawBody;

  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (Buffer.isBuffer(rawBody)) {
    return rawBody;
  }

  if (typeof req.body === "string") {
    return Buffer.from(req.body, "utf8");
  }

  if (typeof rawBody === "string") {
    return Buffer.from(rawBody, "utf8");
  }

  if (req.body && typeof req.body === "object") {
    return Buffer.from(JSON.stringify(req.body));
  }

  return fallback ?? Buffer.from("{}");
}

export interface VenmailIntegrationWebhookOptions<TPayload = Record<string, unknown>> {
  secret: string;
  onEvent: (
    event: VenmailIntegrationEvent<TPayload>,
    req: Request,
    res: Response
  ) => Promise<void> | void;
  allowUnsigned?: boolean;
  signatureHeader?: string;
  eventHeader?: string;
  rawBodyExtractor?: (req: Request) => Buffer;
  autoRespond?: boolean;
}

export function venmailIntegrationWebhook<TPayload = Record<string, unknown>>({
  secret,
  onEvent,
  allowUnsigned = false,
  signatureHeader = DEFAULT_SIGNATURE_HEADER,
  eventHeader = DEFAULT_EVENT_HEADER,
  rawBodyExtractor,
  autoRespond = true,
}: VenmailIntegrationWebhookOptions<TPayload>): RequestHandler {
  if (typeof onEvent !== "function") {
    throw new Error("onEvent handler is required");
  }

  return async (req, res, next) => {
    try {
      const raw = rawBodyExtractor ? rawBodyExtractor(req) : resolveRawBody(req);
      const providedSignature = req.get(signatureHeader) ?? "";

      const isValid = allowUnsigned
        ? true
        : verifyVenmailSignature({ secret, signature: providedSignature, rawBody: raw });

      if (!isValid) {
        res.status(401).json({ ok: false, error: "Invalid Venmail signature" });
        return;
      }

      const parsed = JSON.parse(raw.toString("utf8")) as VenmailIntegrationEventBody<TPayload>;

      const enriched: VenmailIntegrationEvent<TPayload> = {
        ...parsed,
        headers: {
          "x-venmail-event": req.get(eventHeader) ?? parsed.event_type ?? "",
          "x-venmail-signature": providedSignature,
        },
      };

      await onEvent(enriched, req, res);

      if (autoRespond && !res.headersSent) {
        res.status(200).json({ ok: true });
      }
    } catch (error) {
      next(error);
    }
  };
}

export type VenmailWebhookKind =
  | "integration"
  | "mail"
  | "status"
  | "bounce"
  | "form"
  | "unknown";

export interface VenmailWebhookInspection {
  kind: VenmailWebhookKind;
  isCampaignEvent?: boolean;
  campaignId?: string | null;
}

export function detectVenmailWebhookKind(payload: unknown): VenmailWebhookInspection {
  const data = payload as Record<string, unknown> | undefined;

  if (!data) {
    return { kind: "unknown" };
  }

  if (typeof data["event_type"] === "string") {
    return { kind: "integration" };
  }

  if (data["form_id"] && data["events"]) {
    return { kind: "form" };
  }

  if (data["original_message"] && data["bounce"]) {
    const campaignId = extractCampaignId(
      (data["original_message"] as VenmailStatusMessage | undefined)?.tag
    );
    return { kind: "bounce", isCampaignEvent: Boolean(campaignId), campaignId };
  }

  if (data["status"] && data["message"]) {
    const campaignId = extractCampaignId(
      (data["message"] as VenmailStatusMessage | undefined)?.tag
    );
    return { kind: "status", isCampaignEvent: Boolean(campaignId), campaignId };
  }

  if (data["rcpt_to"] && data["message_id"]) {
    return { kind: "mail" };
  }

  return { kind: "unknown" };
}

export interface VenmailStatusMessage {
  message_id?: string;
  to?: string;
  tag?: string;
  [key: string]: unknown;
}

function extractCampaignId(tag?: string): string | null {
  if (!tag || typeof tag !== "string") {
    return null;
  }

  if (tag.startsWith("campaign:")) {
    return tag.split(":")[1] ?? null;
  }

  return null;
}

export interface NormalizedDeliveryEvent {
  messageId?: string;
  recipient?: string;
  status?: string;
  campaignId?: string | null;
  payload: VenmailStatusWebhookPayload | VenmailBounceWebhookPayload;
}

export function normalizeDeliveryEvent(
  payload: VenmailStatusWebhookPayload | VenmailBounceWebhookPayload
): NormalizedDeliveryEvent {
  if (isBouncePayload(payload)) {
    const message = payload.original_message;
    return {
      messageId: message?.message_id,
      recipient: message?.to,
      status: "MessageBounced",
      campaignId: extractCampaignId(message?.tag),
      payload,
    };
  }

  if (isStatusPayload(payload)) {
    const message = payload.message ?? {};
    return {
      messageId: message.message_id,
      recipient: message.to,
      status: payload.status,
      campaignId: extractCampaignId(message.tag),
      payload,
    };
  }

  // Fallback for unknown payload types
  return {
    messageId: undefined,
    recipient: undefined,
    status: "Unknown",
    campaignId: null,
    payload,
  };
}

export function isMailWebhookPayload(value: unknown): value is VenmailMailWebhookPayload {
  const payload = value as VenmailMailWebhookPayload | undefined;
  return Boolean(payload && payload.message_id && payload.rcpt_to);
}

export function isStatusPayload(value: unknown): value is VenmailStatusWebhookPayload {
  const payload = value as VenmailStatusWebhookPayload | undefined;
  return Boolean(payload && payload.status && payload.message);
}

export function isBouncePayload(value: unknown): value is VenmailBounceWebhookPayload {
  const payload = value as VenmailBounceWebhookPayload | undefined;
  return Boolean(payload && payload.original_message && payload.bounce);
}

// Attachment handling utilities for Venmail endpoints
export interface VenmailAttachmentInfo {
  filename: string;
  content_type?: string;
  size?: number;
  storage_url?: string;
  attachment_id?: string;
  thumbnail_url?: string;
}

export function extractAttachments(payload: unknown): VenmailAttachmentInfo[] {
  const data = payload as { attachments?: VenmailAttachmentInfo[] } | undefined;
  
  if (!data?.attachments || !Array.isArray(data.attachments)) {
    return [];
  }
  
  return data.attachments.map(attachment => ({
    filename: attachment.filename,
    content_type: attachment.content_type,
    size: attachment.size,
    storage_url: attachment.storage_url,
    attachment_id: attachment.attachment_id,
    thumbnail_url: attachment.thumbnail_url,
  }));
}

export function hasLargeAttachments(attachments: VenmailAttachmentInfo[], threshold: number = 10 * 1024 * 1024): boolean {
  return attachments.some(attachment => 
    attachment.size && attachment.size > threshold
  );
}

export function getAttachmentDownloadUrl(attachment: VenmailAttachmentInfo, baseUrl: string): string {
  if (attachment.storage_url) {
    return attachment.storage_url;
  }
  
  if (attachment.attachment_id) {
    return `${baseUrl}/api/v1/attachments/${attachment.attachment_id}/download`;
  }
  
  throw new Error('Attachment must have either storage_url or attachment_id');
}

export function getAttachmentThumbnailUrl(attachment: VenmailAttachmentInfo, baseUrl: string): string | null {
  if (attachment.thumbnail_url) {
    return attachment.thumbnail_url;
  }
  
  if (attachment.attachment_id) {
    return `${baseUrl}/api/v1/attachments/${attachment.attachment_id}/thumbnail`;
  }
  
  return null;
}

export type { VenmailIntegrationEvent, VenmailIntegrationEventType, VenmailWebhookRequest };
export * from "./types";
