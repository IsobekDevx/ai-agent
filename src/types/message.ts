import type { APIError } from '@anthropic-ai/sdk'
import type {
  BetaContentBlock,
  BetaMessage,
  BetaRawMessageStreamEvent,
  BetaUsage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type {
  ContentBlockParam,
  ToolResultBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { UUID } from 'crypto'
import type { SDKAssistantMessageError } from '../entrypoints/agentSdkTypes.js'
import type { Progress } from '../Tool.js'
import type {
  BranchAction,
  CommitKind,
  PrAction,
} from '../tools/shared/gitOperationTracking.js'
import type { Attachment } from '../utils/attachments.js'
import type { PermissionMode } from './permissions.js'

export type PartialCompactDirection = 'from' | 'to' | 'up_to' | 'both'

export type MessageOrigin =
  | 'human'
  | 'agent'
  | 'hook'
  | 'scheduled'
  | 'remote'
  | 'coordinator'
  | 'teammate'
  | 'channel'
  | 'proactive'
  | 'system'
  | string
  | {
      kind: string
      [key: string]: unknown
    }

export type SystemMessageLevel = 'info' | 'warning' | 'error' | 'suggestion'

export type StopHookInfo = {
  command: string
  durationMs?: number
  output?: string
  error?: string
  exitCode?: number
  hookName?: string
  [key: string]: unknown
}

export type CompactMetadata = {
  trigger: 'manual' | 'auto'
  preTokens: number
  userContext?: string
  messagesSummarized?: number
  direction?: PartialCompactDirection
  preCompactDiscoveredTools?: string[]
  preservedSegment?: {
    headUuid: UUID
    anchorUuid: UUID
    tailUuid: UUID
  }
}

export type UserMessage = {
  type: 'user'
  uuid: UUID
  timestamp: string
  message: {
    role: 'user'
    content: string | ContentBlockParam[]
  }
  isMeta?: true | boolean
  isVisibleInTranscriptOnly?: true | boolean
  isVirtual?: true | boolean
  isCompactSummary?: true | boolean
  summarizeMetadata?: {
    messagesSummarized: number
    userContext?: string
    direction?: PartialCompactDirection
  }
  toolUseResult?: unknown
  mcpMeta?: {
    _meta?: Record<string, unknown>
    structuredContent?: Record<string, unknown>
  }
  imagePasteIds?: number[]
  sourceToolAssistantUUID?: UUID
  permissionMode?: PermissionMode
  origin?: MessageOrigin
  planContent?: string
}

export type NormalizedUserMessage = Omit<UserMessage, 'message'> & {
  message: {
    role: 'user'
    content: ContentBlockParam[]
  }
}

export type AssistantMessage = {
  type: 'assistant'
  uuid: UUID
  timestamp: string
  message: BetaMessage & {
    content: BetaContentBlock[]
    usage: BetaUsage
    container?: unknown
    context_management?: unknown
  }
  requestId?: string
  apiError?: 'max_output_tokens' | string
  error?: SDKAssistantMessageError
  errorDetails?: string
  isApiErrorMessage?: boolean
  isMeta?: true | boolean
  isVirtual?: true | boolean
  advisorModel?: string
  costUSD?: number
  durationMs?: number
}

export type NormalizedAssistantMessage = AssistantMessage

export type AttachmentMessage<A extends Attachment = Attachment> = {
  type: 'attachment'
  uuid: UUID
  timestamp: string
  attachment: A
  isMeta?: boolean
}

export type ProgressMessage<P extends Progress = Progress> = {
  type: 'progress'
  uuid: UUID
  timestamp: string
  data: P
  toolUseID: string
  parentToolUseID: string
  isMeta?: boolean
}

export type SystemInformationalMessage = {
  type: 'system'
  subtype: 'informational'
  content: string
  level: SystemMessageLevel
  uuid: UUID
  timestamp: string
  isMeta?: boolean
  toolUseID?: string
  preventContinuation?: boolean
}

export type SystemLocalCommandMessage = {
  type: 'system'
  subtype: 'local_command'
  content: string
  level: SystemMessageLevel
  uuid: UUID
  timestamp: string
  isMeta?: boolean
}

export type SystemCompactBoundaryMessage = {
  type: 'system'
  subtype: 'compact_boundary'
  content: string
  level: SystemMessageLevel
  uuid: UUID
  timestamp: string
  isMeta?: boolean
  compactMetadata: CompactMetadata
  logicalParentUuid?: UUID
}

export type SystemMicrocompactBoundaryMessage = {
  type: 'system'
  subtype: 'microcompact_boundary'
  content: string
  level: SystemMessageLevel
  uuid: UUID
  timestamp: string
  isMeta?: boolean
  microcompactMetadata: {
    trigger: 'auto'
    preTokens: number
    tokensSaved: number
    compactedToolIds: string[]
    clearedAttachmentUUIDs: string[]
  }
}

export type SystemAPIErrorMessage = {
  type: 'system'
  subtype: 'api_error'
  level: 'error'
  uuid: UUID
  timestamp: string
  error: APIError | Error
  cause?: Error
  retryInMs: number
  retryAttempt: number
  maxRetries: number
  isMeta?: boolean
}

export type SystemStopHookSummaryMessage = {
  type: 'system'
  subtype: 'stop_hook_summary'
  hookCount: number
  hookInfos: StopHookInfo[]
  hookErrors: string[]
  preventedContinuation: boolean
  stopReason: string | undefined
  hasOutput: boolean
  level: SystemMessageLevel
  uuid: UUID
  timestamp: string
  toolUseID?: string
  hookLabel?: string
  totalDurationMs?: number
  isMeta?: boolean
}

export type SystemTurnDurationMessage = {
  type: 'system'
  subtype: 'turn_duration'
  durationMs: number
  budgetTokens?: number
  budgetLimit?: number
  budgetNudges?: number
  messageCount?: number
  uuid: UUID
  timestamp: string
  isMeta?: boolean
}

export type SystemBridgeStatusMessage = {
  type: 'system'
  subtype: 'bridge_status'
  content: string
  url: string
  upgradeNudge?: string
  uuid: UUID
  timestamp: string
  isMeta?: boolean
}

export type SystemPermissionRetryMessage = {
  type: 'system'
  subtype: 'permission_retry'
  content: string
  commands: string[]
  level: SystemMessageLevel
  uuid: UUID
  timestamp: string
  isMeta?: boolean
}

export type SystemScheduledTaskFireMessage = {
  type: 'system'
  subtype: 'scheduled_task_fire'
  content: string
  uuid: UUID
  timestamp: string
  isMeta?: boolean
}

export type SystemAwaySummaryMessage = {
  type: 'system'
  subtype: 'away_summary'
  content: string
  uuid: UUID
  timestamp: string
  isMeta?: boolean
}

export type SystemMemorySavedMessage = {
  type: 'system'
  subtype: 'memory_saved'
  writtenPaths: string[]
  uuid: UUID
  timestamp: string
  isMeta?: boolean
}

export type SystemAgentsKilledMessage = {
  type: 'system'
  subtype: 'agents_killed'
  uuid: UUID
  timestamp: string
  isMeta?: boolean
}

export type SystemApiMetricsMessage = {
  type: 'system'
  subtype: 'api_metrics'
  ttftMs: number
  otps: number
  isP50?: boolean
  hookDurationMs?: number
  turnDurationMs?: number
  toolDurationMs?: number
  classifierDurationMs?: number
  toolCount?: number
  hookCount?: number
  classifierCount?: number
  configWriteCount?: number
  uuid: UUID
  timestamp: string
  isMeta?: boolean
}

export type SystemThinkingMessage = {
  type: 'system'
  subtype: 'thinking'
  content: string
  uuid: UUID
  timestamp: string
  isMeta?: boolean
}

export type SystemFileSnapshotMessage = {
  type: 'system'
  subtype: 'file_snapshot'
  content: string
  level: SystemMessageLevel
  isMeta?: boolean
  timestamp: string
  uuid: UUID
  snapshotFiles: Array<{
    key: string
    path: string
    content: string
  }>
}

export type SystemSnipBoundaryMessage = {
  type: 'system'
  subtype: 'snip_boundary'
  content: string
  level?: SystemMessageLevel
  isMeta?: boolean
  timestamp: string
  uuid: UUID
  snippedCount?: number
  tokensSaved?: number
  [key: string]: unknown
}

export type SystemMessage =
  | SystemInformationalMessage
  | SystemLocalCommandMessage
  | SystemCompactBoundaryMessage
  | SystemMicrocompactBoundaryMessage
  | SystemAPIErrorMessage
  | SystemStopHookSummaryMessage
  | SystemTurnDurationMessage
  | SystemBridgeStatusMessage
  | SystemPermissionRetryMessage
  | SystemScheduledTaskFireMessage
  | SystemAwaySummaryMessage
  | SystemMemorySavedMessage
  | SystemAgentsKilledMessage
  | SystemApiMetricsMessage
  | SystemThinkingMessage
  | SystemFileSnapshotMessage
  | SystemSnipBoundaryMessage

export type Message =
  | UserMessage
  | AssistantMessage
  | AttachmentMessage
  | ProgressMessage
  | SystemMessage

export type NormalizedMessage =
  | NormalizedUserMessage
  | NormalizedAssistantMessage
  | AttachmentMessage
  | ProgressMessage
  | SystemMessage

export type HookResultMessage =
  | AttachmentMessage
  | SystemMessage
  | UserMessage
  | AssistantMessage

export type GroupedToolUseMessage = {
  type: 'grouped_tool_use'
  toolName: string
  messages: NormalizedAssistantMessage[]
  results: NormalizedUserMessage[]
  displayMessage: NormalizedAssistantMessage
  uuid: string | UUID
  timestamp: string
  messageId: string
}

export type CollapsibleMessage =
  | NormalizedAssistantMessage
  | NormalizedUserMessage
  | GroupedToolUseMessage
  | AttachmentMessage
  | SystemMessage

export type CollapsedReadSearchGroup = {
  type: 'collapsed_read_search'
  searchCount: number
  readCount: number
  listCount: number
  replCount: number
  memorySearchCount: number
  memoryReadCount: number
  memoryWriteCount: number
  teamMemorySearchCount?: number
  teamMemoryReadCount?: number
  teamMemoryWriteCount?: number
  readFilePaths: string[]
  searchArgs: string[]
  latestDisplayHint: string | undefined
  messages: CollapsibleMessage[]
  displayMessage: CollapsibleMessage
  uuid: UUID
  timestamp: string
  mcpCallCount?: number
  mcpServerNames?: string[]
  bashCount?: number
  gitOpBashCount?: number
  commits?: { sha: string; kind: CommitKind }[]
  pushes?: { branch: string }[]
  branches?: { ref: string; action: BranchAction }[]
  prs?: { number: number; url?: string; action: PrAction }[]
  hookTotalMs?: number
  hookCount?: number
  hookInfos?: StopHookInfo[]
  relevantMemories?: { path: string; content: string; mtimeMs: number }[]
}

export type RenderableMessage =
  | NormalizedUserMessage
  | NormalizedAssistantMessage
  | AttachmentMessage
  | SystemMessage
  | GroupedToolUseMessage
  | CollapsedReadSearchGroup
  | ProgressMessage

export type StreamEvent = {
  type: 'stream_event'
  event: BetaRawMessageStreamEvent
  ttftMs?: number
}

export type RequestStartEvent = {
  type: 'stream_request_start'
  queryTracking?: {
    chainId: string
    depth: number
  }
  turnId?: string
}

export type TombstoneMessage = {
  type: 'tombstone'
  message: Message
}

export type ToolUseSummaryMessage = {
  type: 'tool_use_summary'
  summary: string
  precedingToolUseIds: string[]
  uuid: UUID
  timestamp: string
}

export type { ToolUseBlock, ToolResultBlockParam }
