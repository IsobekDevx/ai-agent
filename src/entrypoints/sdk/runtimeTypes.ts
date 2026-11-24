import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js"
import type { z } from "zod/v4"
import type { SDKMessage, SDKResultMessage, SDKSessionInfo, SDKUserMessage } from "./coreTypes.js"

export type AnyZodRawShape = Record<string, z.ZodTypeAny>
export type InferShape<T extends AnyZodRawShape> = {
  [K in keyof T]: z.infer<T[K]>
}

export type EffortLevel = "low" | "medium" | "high" | "max"

export type SdkMcpToolDefinition<Schema extends AnyZodRawShape = AnyZodRawShape> = {
  name: string
  description: string
  inputSchema: Schema
  handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>
  annotations?: ToolAnnotations
  searchHint?: string
  alwaysLoad?: boolean
}

export type McpSdkServerConfigWithInstance = {
  type: "sdk"
  name: string
  instance: unknown
}

export type Options = {
  cwd?: string
  model?: string
  fallbackModel?: string
  maxTurns?: number
  maxBudgetUsd?: number
  customSystemPrompt?: string
  appendSystemPrompt?: string
  permissionMode?: string
  allowDangerouslySkipPermissions?: boolean
  continue?: boolean
  resume?: string
  abortController?: AbortController
  env?: Record<string, string | undefined>
  [key: string]: any
}

export type InternalOptions = Options & {
  [key: string]: any
}

export interface Query extends AsyncGenerator<SDKMessage, void, unknown> {
  interrupt(): Promise<void>
  setPermissionMode(mode: any): Promise<void>
  setModel(model?: string): Promise<void>
  setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void>
  close(): void
}

export interface InternalQuery extends Query {
  [key: string]: any
}

export type SDKSessionOptions = Options

export interface SDKSession {
  readonly sessionId: string
  send(message: string | SDKUserMessage): Promise<void>
  stream(): AsyncGenerator<SDKMessage, void, unknown>
  close(): void
  [Symbol.asyncDispose](): Promise<void>
}

export type ListSessionsOptions = { dir?: string; limit?: number }
export type GetSessionInfoOptions = { dir?: string }
export type GetSessionMessagesOptions = { dir?: string; limit?: number; offset?: number }
export type SessionMessage = SDKMessage
export type SessionMutationOptions = { dir?: string }
export type ForkSessionOptions = { dir?: string; upToMessageId?: string; title?: string }
export type ForkSessionResult = { sessionId: string }
