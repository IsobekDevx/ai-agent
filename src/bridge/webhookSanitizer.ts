import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'

export type WebhookContent = string | Array<ContentBlockParam>

/**
 * Fail closed: the caller drops the inbound message if sanitization is missing.
 * Never pass untrusted webhook content through unchanged.
 */
export function sanitizeInboundWebhookContent(
  _content: WebhookContent,
): WebhookContent {
  throw new Error('Webhook sanitization is unavailable in this build')
}
