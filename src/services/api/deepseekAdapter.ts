import { createHash, randomUUID } from 'crypto'
import type {
  BetaContentBlock,
  BetaMessage,
  BetaToolUnion,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type {
  AssistantMessage,
  StreamEvent,
  UserMessage,
} from '../../types/message.js'
import type {
  DeepSeekChatChunk,
  DeepSeekChatMessage,
  DeepSeekChatRequest,
  DeepSeekContentPart,
  DeepSeekTool,
  DeepSeekUsage,
} from './deepseekClient.js'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * DeepSeek function name constraints: ^[a-zA-Z0-9_-]{1,64}$
 * Provides a reversible mapping between internal tool names and DeepSeek function names.
 */
export interface ToolNameMapper {
  toDeepSeekName(originalName: string): string
  toOriginalName(deepSeekName: string): string
}

export function createToolNameMapper(toolNames: string[] = []): ToolNameMapper {
  const forward = new Map<string, string>()
  const reverse = new Map<string, string>()

  const register = (originalName: string): string => {
    const existing = forward.get(originalName)
    if (existing) return existing

    let candidate = originalName.replace(/[^a-zA-Z0-9_-]/g, '_')
    if (!candidate) {
      candidate = 'tool'
    }
    if (candidate.length > 64 || (reverse.has(candidate) && reverse.get(candidate) !== originalName)) {
      const hash = createHash('sha256').update(originalName).digest('hex').slice(0, 8)
      candidate = `${candidate.slice(0, 55)}_${hash}`
    }

    forward.set(originalName, candidate)
    reverse.set(candidate, originalName)
    return candidate
  }

  for (const name of toolNames) {
    register(name)
  }

  return {
    toDeepSeekName(originalName: string): string {
      return register(originalName)
    },
    toOriginalName(deepSeekName: string): string {
      return reverse.get(deepSeekName) ?? deepSeekName
    },
  }
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map(block => {
      const record = asRecord(block)
      if (record?.type === 'text' && typeof record.text === 'string') {
        return record.text
      }
      if (record?.type === 'image') {
        const source = asRecord(record.source)
        const mediaType = source?.media_type
        return `[Image${typeof mediaType === 'string' ? `: ${mediaType}` : ''}]`
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function imageParts(content: unknown): DeepSeekContentPart[] {
  if (!Array.isArray(content)) return []
  const parts: DeepSeekContentPart[] = []

  for (const block of content) {
    const record = asRecord(block)
    if (record?.type === 'text' && typeof record.text === 'string') {
      parts.push({ type: 'text', text: record.text })
      continue
    }
    if (record?.type !== 'image') continue

    const source = asRecord(record.source)
    if (source?.type === 'url' && typeof source.url === 'string') {
      parts.push({ type: 'image_url', image_url: { url: source.url } })
      continue
    }
    if (
      source?.type === 'base64' &&
      typeof source.data === 'string' &&
      typeof source.media_type === 'string'
    ) {
      parts.push({
        type: 'image_url',
        image_url: {
          url: `data:${source.media_type};base64,${source.data}`,
        },
      })
    }
  }

  return parts
}

function userMessageToDeepSeek(message: UserMessage): DeepSeekChatMessage[] {
  if (typeof message.message.content === 'string') {
    return [{ role: 'user', content: message.message.content }]
  }

  const converted: DeepSeekChatMessage[] = []

  // IMPORTANT: Emit tool_result blocks FIRST as `role: 'tool'` messages so they
  // immediately follow the preceding assistant `tool_calls` message, as required by DeepSeek.
  for (const block of message.message.content) {
    const record = asRecord(block)
    if (record?.type !== 'tool_result') continue
    const toolUseId = record.tool_use_id
    if (typeof toolUseId !== 'string') continue

    const resultText = textFromContent(record.content)
    converted.push({
      role: 'tool',
      tool_call_id: toolUseId,
      content: record.is_error ? `Error: ${resultText}` : resultText,
    })
  }

  const parts = imageParts(message.message.content)
  const hasImages = parts.some(part => part.type === 'image_url')
  const text = textFromContent(message.message.content)

  if (hasImages) {
    const textIndex = parts.findIndex(part => part.type === 'text')
    if (text && textIndex === -1) parts.unshift({ type: 'text', text })
    converted.push({ role: 'user', content: parts })
  } else if (text) {
    converted.push({ role: 'user', content: text })
  }

  return converted
}

function assistantMessageToDeepSeek(
  message: AssistantMessage,
  mapper?: ToolNameMapper,
): DeepSeekChatMessage | null {
  const text: string[] = []
  const reasoning: string[] = []
  const toolCalls: NonNullable<DeepSeekChatMessage['tool_calls']> = []

  for (const block of message.message.content) {
    const record = asRecord(block)
    if (record?.type === 'text' && typeof record.text === 'string') {
      text.push(record.text)
    } else if (
      record?.type === 'thinking' &&
      typeof record.thinking === 'string'
    ) {
      reasoning.push(record.thinking)
    } else if (
      record?.type === 'tool_use' &&
      typeof record.id === 'string' &&
      typeof record.name === 'string'
    ) {
      const fnName = mapper
        ? mapper.toDeepSeekName(record.name)
        : record.name
      toolCalls.push({
        id: record.id,
        type: 'function',
        function: {
          name: fnName,
          arguments: JSON.stringify(record.input ?? {}),
        },
      })
    }
  }

  const content = text.join('\n') || (toolCalls.length > 0 ? '' : null)
  const reasoningContent = reasoning.join('\n')
  if (content === null && reasoningContent === '' && toolCalls.length === 0) {
    return null
  }

  return {
    role: 'assistant',
    content,
    ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
    ...(reasoningContent && { reasoning_content: reasoningContent }),
  }
}

export function toDeepSeekMessages(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: readonly string[],
  mapper?: ToolNameMapper,
): DeepSeekChatMessage[] {
  const converted: DeepSeekChatMessage[] = []
  const system = systemPrompt.filter(Boolean).join('\n\n')
  if (system) converted.push({ role: 'system', content: system })

  for (const message of messages) {
    if (message.type === 'user') {
      converted.push(...userMessageToDeepSeek(message))
    } else if (message.type === 'assistant') {
      const assistant = assistantMessageToDeepSeek(message, mapper)
      if (assistant) converted.push(assistant)
    }
  }
  return converted
}

export function toDeepSeekTools(
  tools: BetaToolUnion[],
  mapper?: ToolNameMapper,
): DeepSeekTool[] {
  return tools.flatMap(tool => {
    const record = asRecord(tool)
    if (
      !record ||
      typeof record.name !== 'string' ||
      !asRecord(record.input_schema)
    ) {
      return []
    }
    const fnName = mapper
      ? mapper.toDeepSeekName(record.name)
      : record.name
    return [
      {
        type: 'function' as const,
        function: {
          name: fnName,
          ...(typeof record.description === 'string' && {
            description: record.description,
          }),
          parameters: record.input_schema as Record<string, unknown>,
        },
      },
    ]
  })
}

export function toDeepSeekToolChoice(
  toolChoice: unknown,
  mapper?: ToolNameMapper,
): DeepSeekChatRequest['tool_choice'] {
  const choice = asRecord(toolChoice)
  if (choice?.type === 'auto') return 'auto'
  if (choice?.type === 'any') return 'required'
  if (choice?.type === 'none') return 'none'
  if (choice?.type === 'tool' && typeof choice.name === 'string') {
    const fnName = mapper ? mapper.toDeepSeekName(choice.name) : choice.name
    return { type: 'function', function: { name: fnName } }
  }
  return undefined
}

export function toDeepSeekResponseFormat(
  outputFormat: unknown,
): DeepSeekChatRequest['response_format'] {
  const format = asRecord(outputFormat)
  const schema = asRecord(format?.schema)
  if (format?.type !== 'json_schema' || !schema) return undefined
  return {
    type: 'json_schema',
    json_schema: {
      name: 'response',
      schema,
    },
  }
}

function mapStopReason(
  reason: DeepSeekChatChunk['choices'][number]['finish_reason'],
): BetaMessage['stop_reason'] {
  if (reason === 'length') return 'max_tokens'
  if (reason === 'tool_calls') return 'tool_use'
  return 'end_turn'
}

export function mapDeepSeekUsage(usage: DeepSeekUsage | undefined) {
  const promptTokens = usage?.prompt_tokens ?? 0
  const completionTokens = usage?.completion_tokens ?? 0
  const cacheHitTokens = usage?.prompt_cache_hit_tokens ?? 0
  const cacheMissTokens =
    usage?.prompt_cache_miss_tokens ?? Math.max(0, promptTokens - cacheHitTokens)
  const reasoningTokens =
    usage?.completion_tokens_details?.reasoning_tokens ?? 0

  return {
    input_tokens: cacheMissTokens,
    output_tokens: completionTokens,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: cacheHitTokens,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: usage?.total_tokens ?? promptTokens + completionTokens,
    prompt_cache_hit_tokens: cacheHitTokens,
    prompt_cache_miss_tokens: cacheMissTokens,
    reasoning_tokens: reasoningTokens,
    server_tool_use: {
      web_search_requests: 0,
      web_fetch_requests: 0,
    },
    service_tier: 'standard' as const,
    cache_creation: {
      ephemeral_1h_input_tokens: 0,
      ephemeral_5m_input_tokens: 0,
    },
    inference_geo: null,
    iterations: null,
    speed: null,
  }
}

export function parseAndValidateToolInput(rawArguments: string): {
  valid: boolean
  input: Record<string, unknown>
  error?: string
} {
  const trimmed = rawArguments.trim()
  if (!trimmed) {
    return { valid: true, input: {} }
  }
  try {
    const parsed = JSON.parse(trimmed)
    const record = asRecord(parsed)
    if (!record) {
      return {
        valid: false,
        input: { __invalid_tool_json__: trimmed },
        error: 'Tool arguments must be a JSON object',
      }
    }
    return { valid: true, input: record }
  } catch (err) {
    return {
      valid: false,
      input: {
        __invalid_tool_json__: trimmed,
        __parse_error__: err instanceof Error ? err.message : String(err),
      },
      error: err instanceof Error ? err.message : 'Malformed JSON tool arguments',
    }
  }
}

export async function* deepSeekChunksToEvents(
  chunks: AsyncIterable<DeepSeekChatChunk>,
  requestedModel: string,
  mapper?: ToolNameMapper,
): AsyncGenerator<StreamEvent | AssistantMessage> {
  const startedAt = Date.now()
  let messageId = `deepseek-${randomUUID()}`
  let model = requestedModel
  let usage: DeepSeekUsage | undefined
  let stopReason: BetaMessage['stop_reason'] = null
  let messageStarted = false
  const contentBlocks: BetaContentBlock[] = []
  const openBlocks: number[] = []
  let textIndex: number | undefined
  let thinkingIndex: number | undefined
  const toolStates = new Map<
    number,
    {
      blockIndex?: number
      id: string
      name: string
      arguments: string
      emittedArguments: number
    }
  >()

  for await (const chunk of chunks) {
    if (!messageStarted) {
      messageStarted = true
      messageId = chunk.id || messageId
      model = chunk.model || requestedModel
      const message: BetaMessage = {
        id: messageId,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: mapDeepSeekUsage(usage),
      }
      yield {
        type: 'stream_event',
        event: { type: 'message_start', message },
        ttftMs: Date.now() - startedAt,
      }
    }

    model = chunk.model || model
    usage = chunk.usage ?? usage

    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta
      if (!delta) continue

      if (delta.reasoning_content) {
        if (thinkingIndex === undefined) {
          thinkingIndex = contentBlocks.length
          contentBlocks.push({ type: 'thinking', thinking: '', signature: '' })
          openBlocks.push(thinkingIndex)
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_start',
              index: thinkingIndex,
              content_block: { type: 'thinking', thinking: '', signature: '' },
            },
          }
        }
        const block = contentBlocks[thinkingIndex]
        if (block && block.type === 'thinking') {
          block.thinking += delta.reasoning_content
        }
        yield {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: thinkingIndex,
            delta: {
              type: 'thinking_delta',
              thinking: delta.reasoning_content,
            },
          },
        }
      }

      if (delta.content) {
        if (textIndex === undefined) {
          textIndex = contentBlocks.length
          contentBlocks.push({ type: 'text', text: '', citations: null })
          openBlocks.push(textIndex)
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_start',
              index: textIndex,
              content_block: { type: 'text', text: '', citations: null },
            },
          }
        }
        const block = contentBlocks[textIndex]
        if (block && block.type === 'text') {
          block.text += delta.content
        }
        yield {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: textIndex,
            delta: { type: 'text_delta', text: delta.content },
          },
        }
      }

      for (const toolDelta of delta.tool_calls ?? []) {
        const idx = toolDelta.index ?? 0
        let state = toolStates.get(idx)
        if (!state) {
          state = {
            id: '',
            name: '',
            arguments: '',
            emittedArguments: 0,
          }
          toolStates.set(idx, state)
        }
        if (toolDelta.id) {
          state.id += toolDelta.id
        }
        if (toolDelta.function?.name) {
          state.name += toolDelta.function.name
        }
        if (toolDelta.function?.arguments) {
          state.arguments += toolDelta.function.arguments
        }

        if (state.blockIndex === undefined && state.id && state.name) {
          const originalName = mapper
            ? mapper.toOriginalName(state.name)
            : state.name
          state.blockIndex = contentBlocks.length
          contentBlocks.push({
            type: 'tool_use',
            id: state.id,
            name: originalName,
            input: {},
          })
          openBlocks.push(state.blockIndex)
          yield {
            type: 'stream_event',
            event: {
              type: 'content_block_start',
              index: state.blockIndex,
              content_block: {
                type: 'tool_use',
                id: state.id,
                name: originalName,
                input: {},
              },
            },
          }
        }

        if (state.blockIndex !== undefined) {
          const partialJson = state.arguments.slice(state.emittedArguments)
          if (partialJson) {
            state.emittedArguments = state.arguments.length
            yield {
              type: 'stream_event',
              event: {
                type: 'content_block_delta',
                index: state.blockIndex,
                delta: { type: 'input_json_delta', partial_json: partialJson },
              },
            }
          }
        }
      }

      if (choice.finish_reason) {
        stopReason = mapStopReason(choice.finish_reason)
      }
    }
  }

  // Finalize any tool calls that didn't emit a start event earlier
  for (const state of toolStates.values()) {
    if (state.blockIndex === undefined && (state.name || state.id)) {
      const id = state.id || `call_${randomUUID()}`
      const originalName = mapper
        ? mapper.toOriginalName(state.name)
        : state.name
      state.blockIndex = contentBlocks.length
      contentBlocks.push({
        type: 'tool_use',
        id,
        name: originalName,
        input: {},
      })
      openBlocks.push(state.blockIndex)
    }
  }

  if (contentBlocks.length === 0) {
    throw new Error('DeepSeek returned an empty response')
  }

  const hasToolUse = contentBlocks.some(block => block.type === 'tool_use')
  const finalStopReason =
    stopReason === 'max_tokens'
      ? 'max_tokens'
      : hasToolUse
        ? 'tool_use'
        : (stopReason ?? 'end_turn')

  for (const index of openBlocks) {
    const block = contentBlocks[index]
    if (block && block.type === 'tool_use') {
      const state = [...toolStates.values()].find(
        candidate => candidate.blockIndex === index,
      )
      if (state) {
        block.name = mapper ? mapper.toOriginalName(state.name) : state.name
      }
      const parsed = parseAndValidateToolInput(state?.arguments ?? '')
      block.input = parsed.input
    }
    yield {
      type: 'stream_event',
      event: { type: 'content_block_stop', index },
    }
  }

  const finalUsage = mapDeepSeekUsage(usage)
  yield {
    type: 'stream_event',
    event: {
      type: 'message_delta',
      delta: { stop_reason: finalStopReason, stop_sequence: null },
      usage: { output_tokens: finalUsage.output_tokens },
    },
  }
  yield {
    type: 'stream_event',
    event: { type: 'message_stop' },
  }

  yield {
    type: 'assistant',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    requestId: messageId,
    durationMs: Date.now() - startedAt,
    ...(finalStopReason === 'max_tokens' && { apiError: 'max_output_tokens' }),
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model,
      content: contentBlocks,
      stop_reason: finalStopReason,
      stop_sequence: null,
      usage: finalUsage,
    },
  }
}
