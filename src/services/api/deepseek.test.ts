import { randomUUID } from 'crypto'
import { APIConnectionTimeoutError } from '@anthropic-ai/sdk/error'
import type {
  BetaContentBlock,
  BetaToolUnion,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssistantMessage, UserMessage } from '../../types/message.js'
import {
  DEFAULT_DEEPSEEK_MODEL,
  clearStoredDeepSeekApiKey,
  getAPIProvider,
  getStoredDeepSeekApiKey,
  resolveDeepSeekModel,
  saveStoredDeepSeekApiKey,
} from '../../utils/model/providers.js'
import { isProviderManagedEnvVar } from '../../utils/managedEnvConstants.js'
import {
  createToolNameMapper,
  deepSeekChunksToEvents,
  toDeepSeekMessages,
  toDeepSeekResponseFormat,
  toDeepSeekToolChoice,
  toDeepSeekTools,
} from './deepseekAdapter.js'
import {
  type DeepSeekChatChunk,
  type DeepSeekChatRequest,
  getDeepSeekEndpoint,
  streamDeepSeekChat,
  verifyDeepSeekApiKey,
} from './deepseekClient.js'

function user(content: UserMessage['message']['content']): UserMessage {
  return {
    type: 'user',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    message: { role: 'user', content },
  }
}

function assistant(content: BetaContentBlock[]): AssistantMessage {
  return {
    type: 'assistant',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    message: {
      id: randomUUID(),
      type: 'message',
      role: 'assistant',
      model: DEFAULT_DEEPSEEK_MODEL,
      content,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  }
}

function chunk(
  delta: DeepSeekChatChunk['choices'][number]['delta'] = {},
  overrides: Partial<DeepSeekChatChunk> = {},
  finishReason?: DeepSeekChatChunk['choices'][number]['finish_reason'],
): DeepSeekChatChunk {
  return {
    id: 'chat-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: DEFAULT_DEEPSEEK_MODEL,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    ...overrides,
  }
}

async function* iterate<T>(values: T[]): AsyncGenerator<T> {
  yield* values
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of source) values.push(value)
  return values
}

beforeEach(() => {
  vi.stubEnv('CLAUDE_CODE_USE_BEDROCK', undefined)
  vi.stubEnv('CLAUDE_CODE_USE_VERTEX', undefined)
  vi.stubEnv('CLAUDE_CODE_USE_FOUNDRY', undefined)
  vi.stubEnv('CLAUDE_CODE_USE_DEEPSEEK', undefined)
  vi.stubEnv('CLAUDE_CODE_SIMPLE', undefined)
  vi.stubEnv('DEEPSEEK_API_KEY', undefined)
  vi.stubEnv('DEEPSEEK_BASE_URL', undefined)
  vi.stubEnv('DEEPSEEK_MODEL', undefined)
  vi.stubEnv('CLAUDE_CONFIG_DIR', '/nonexistent/deepseek-vitest-config')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('DeepSeek provider configuration', () => {
  it('selects DeepSeek from its API key or explicit flag', () => {
    expect(getAPIProvider()).toBe('firstParty')
    vi.stubEnv('DEEPSEEK_API_KEY', 'secret')
    expect(getAPIProvider()).toBe('deepseek')
    vi.stubEnv('DEEPSEEK_API_KEY', undefined)
    vi.stubEnv('CLAUDE_CODE_USE_DEEPSEEK', '1')
    expect(getAPIProvider()).toBe('deepseek')
  })

  it('keeps other explicit providers ahead of DeepSeek', () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'secret')
    vi.stubEnv('CLAUDE_CODE_USE_BEDROCK', '1')
    expect(getAPIProvider()).toBe('bedrock')
  })

  it('resolves aliases, context tags, and configured model IDs', () => {
    vi.stubEnv('DEEPSEEK_MODEL', 'deepseek-v4-pro')
    expect(resolveDeepSeekModel()).toBe('deepseek-v4-pro')
    expect(resolveDeepSeekModel('sonnet')).toBe('deepseek-v4-pro')
    expect(resolveDeepSeekModel('claude-sonnet-4-6')).toBe('deepseek-v4-pro')
    expect(resolveDeepSeekModel('deepseek-chat[1m]')).toBe('deepseek-chat')
    vi.stubEnv('DEEPSEEK_MODEL', undefined)
    expect(resolveDeepSeekModel('opus')).toBe('deepseek-v4-pro')
    expect(resolveDeepSeekModel()).toBe(DEFAULT_DEEPSEEK_MODEL)
    expect(resolveDeepSeekModel('constructor')).toBe('constructor')
  })

  it('protects host-managed DeepSeek routing and credentials', () => {
    for (const key of [
      'CLAUDE_CODE_USE_DEEPSEEK',
      'DEEPSEEK_BASE_URL',
      'DEEPSEEK_API_KEY',
      'DEEPSEEK_MODEL',
    ]) {
      expect(isProviderManagedEnvVar(key)).toBe(true)
    }
  })

  it('does not read or update stored DeepSeek credentials in bare mode', () => {
    vi.stubEnv('CLAUDE_CODE_SIMPLE', '1')
    expect(getStoredDeepSeekApiKey()).toBeNull()
    expect(saveStoredDeepSeekApiKey('secret')).toBe(false)
    expect(clearStoredDeepSeekApiKey()).toBe(false)
  })
})

describe('DeepSeek client', () => {
  const request: DeepSeekChatRequest = {
    model: DEFAULT_DEEPSEEK_MODEL,
    messages: [{ role: 'user', content: 'Salom' }],
  }

  it('builds endpoints without duplicating the completions path', () => {
    expect(getDeepSeekEndpoint()).toBe(
      'https://api.deepseek.com/chat/completions',
    )
    vi.stubEnv('DEEPSEEK_BASE_URL', 'https://proxy.example/v1/')
    expect(getDeepSeekEndpoint()).toBe('https://proxy.example/v1/chat/completions')
    expect(getDeepSeekEndpoint('https://other.example/chat/completions')).toBe(
      'https://other.example/chat/completions',
    )
  })

  it('parses SSE events split across arbitrary byte boundaries', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'secret')
    vi.stubEnv('DEEPSEEK_BASE_URL', 'https://proxy.example/v1')
    const first = chunk({ content: 'Salom' })
    const second = chunk(
      { content: ' dunyo' },
      { id: 'chat-2', model: 'deepseek-chat' },
    )
    const sse = [
      ': keep-alive\r\n\r\n',
      `data: ${JSON.stringify(first)}\r\n\r\n`,
      `data: ${JSON.stringify(second)}\n\n`,
      'data: [DONE]\n\n',
      'data: not-json\n\n',
    ].join('')
    const bytes = new TextEncoder().encode(sse)
    const response = new Response(
      new ReadableStream({
        start(controller) {
          for (let offset = 0; offset < bytes.length; offset += 7) {
            controller.enqueue(bytes.slice(offset, offset + 7))
          }
          controller.close()
        },
      }),
      { status: 200 },
    )
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => response,
    )

    await expect(
      collect(streamDeepSeekChat(request, { fetch: fetchMock })),
    ).resolves.toEqual([first, second])
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proxy.example/v1/chat/completions')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: DEFAULT_DEEPSEEK_MODEL,
      stream: true,
      stream_options: { include_usage: true },
    })
  })

  it('joins multiline SSE data and flushes an unterminated final event', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'secret')
    const value = chunk({ content: 'ok' }, {}, 'stop')
    const sse = JSON.stringify(value, null, 2)
      .split('\n')
      .map(line => `data: ${line}`)
      .join('\n')
    const fetchMock = vi.fn(async () => new Response(sse, { status: 200 }))
    await expect(
      collect(streamDeepSeekChat(request, { fetch: fetchMock })),
    ).resolves.toEqual([value])
  })

  it('reports HTTP failures with status and response text', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'secret')
    const fetchMock = vi.fn(async () =>
      new Response('rate limited', { status: 429 }),
    )
    await expect(
      collect(streamDeepSeekChat(request, { fetch: fetchMock, maxRetries: 0 })),
    ).rejects.toMatchObject({
      name: 'DeepSeekAPIError',
      status: 429,
      responseBody: 'rate limited',
    })
  })

  it('requires an API key and forwards abort signals', async () => {
    await expect(collect(streamDeepSeekChat(request))).rejects.toThrow(
      'DEEPSEEK_API_KEY is missing',
    )
    vi.stubEnv('DEEPSEEK_API_KEY', 'secret')
    const controller = new AbortController()
    const abortError = new DOMException('Aborted', 'AbortError')
    const fetchMock = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          if (signal?.aborted) reject(abortError)
          else signal?.addEventListener('abort', () => reject(abortError), { once: true })
          controller.abort()
        }),
    )
    await expect(
      collect(
        streamDeepSeekChat(request, {
          fetch: fetchMock,
          signal: controller.signal,
        }),
      ),
    ).rejects.toThrow('Request was aborted.')
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true)
  })

  it('enforces API timeouts for stalled requests', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'secret')
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          const rejectAbort = (): void => {
            reject(new DOMException('Aborted', 'AbortError'))
          }
          if (signal?.aborted) rejectAbort()
          else signal?.addEventListener('abort', rejectAbort, { once: true })
        }),
    )
    await expect(
      collect(
        streamDeepSeekChat(request, {
          fetch: fetchMock,
          maxRetries: 0,
          timeoutMs: 25,
        }),
      ),
    ).rejects.toBeInstanceOf(APIConnectionTimeoutError)
  })

  it('verifies keys with a non-streaming request', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'secret')
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        stream: false,
        max_tokens: 1,
      })
      return new Response('{}', { status: 200 })
    })
    await expect(verifyDeepSeekApiKey({ fetch: fetchMock })).resolves.toBe(true)
    vi.stubEnv('DEEPSEEK_API_KEY', undefined)
    await expect(verifyDeepSeekApiKey({ fetch: fetchMock })).resolves.toBe(false)
  })
})

describe('DeepSeek message and tool adapter', () => {
  it('converts images, tool results, reasoning, and assistant tool calls', () => {
    const converted = toDeepSeekMessages(
      [
        user([
          { type: 'text', text: 'Rasmni ko‘r' },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: 'aGVsbG8=',
            },
          },
          {
            type: 'tool_result',
            tool_use_id: 'call-1',
            content: 'topilmadi',
            is_error: true,
          },
        ]),
        assistant([
          { type: 'thinking', thinking: 'Avval tekshiraman', signature: '' },
          { type: 'text', text: 'Faylni o‘qiyman', citations: null },
          {
            type: 'tool_use',
            id: 'call-1',
            name: 'Read',
            input: { file_path: 'a.ts' },
          },
        ]),
      ],
      ['System prompt'],
    )

    expect(converted).toEqual([
      { role: 'system', content: 'System prompt' },
      { role: 'tool', tool_call_id: 'call-1', content: 'Error: topilmadi' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Rasmni ko‘r' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,aGVsbG8=' },
          },
        ],
      },
      {
        role: 'assistant',
        content: 'Faylni o‘qiyman',
        reasoning_content: 'Avval tekshiraman',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'Read',
              arguments: '{"file_path":"a.ts"}',
            },
          },
        ],
      },
    ])
  })

  it('converts tools, tool choice, and structured output', () => {
    const tools = [
      {
        name: 'Read',
        description: 'Read a file',
        input_schema: { type: 'object', properties: {} },
      },
    ] as BetaToolUnion[]
    expect(toDeepSeekTools(tools)).toEqual([
      {
        type: 'function',
        function: {
          name: 'Read',
          description: 'Read a file',
          parameters: { type: 'object', properties: {} },
        },
      },
    ])
    expect(toDeepSeekToolChoice({ type: 'any' })).toBe('required')
    expect(toDeepSeekToolChoice({ type: 'tool', name: 'Read' })).toEqual({
      type: 'function',
      function: { name: 'Read' },
    })
    expect(
      toDeepSeekResponseFormat({
        type: 'json_schema',
        schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
      }),
    ).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'response',
        schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
      },
    })
  })
})

describe('DeepSeek stream adapter', () => {
  it('emits Anthropic-compatible reasoning, text, tools, usage, and final message', async () => {
    const events = await collect(
      deepSeekChunksToEvents(
        iterate([
          chunk({ reasoning_content: 'O‘ylayman' }),
          chunk({ content: 'Tayyor' }),
          chunk({
            tool_calls: [
              { index: 0, function: { arguments: '{"file_path":' } },
            ],
          }),
          chunk(
            {
              tool_calls: [
                {
                  index: 0,
                  id: 'call-1',
                  function: { name: 'Read', arguments: '"a.ts"}' },
                },
              ],
            },
            {},
            'tool_calls',
          ),
          chunk({}, {
            choices: [],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 7,
              total_tokens: 19,
              prompt_cache_hit_tokens: 3,
            },
          }),
        ]),
        'deepseek-reasoner',
      ),
    )
    const streamEvents = events.filter(event => event.type === 'stream_event')
    expect(streamEvents.map(event => event.event.type)).toEqual([
      'message_start',
      'content_block_start',
      'content_block_delta',
      'content_block_start',
      'content_block_delta',
      'content_block_start',
      'content_block_delta',
      'content_block_stop',
      'content_block_stop',
      'content_block_stop',
      'message_delta',
      'message_stop',
    ])
    const final = events.at(-1)
    expect(final?.type).toBe('assistant')
    if (final?.type !== 'assistant') throw new Error('Missing assistant message')
    expect(final.message.stop_reason).toBe('tool_use')
    expect(final.message.usage).toMatchObject({
      input_tokens: 9,
      output_tokens: 7,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 3,
      cache_creation: { ephemeral_5m_input_tokens: 0 },
    })
    expect(final.message.content).toEqual([
      { type: 'thinking', thinking: 'O‘ylayman', signature: '' },
      { type: 'text', text: 'Tayyor', citations: null },
      {
        type: 'tool_use',
        id: 'call-1',
        name: 'Read',
        input: { file_path: 'a.ts' },
      },
    ])
  })

  it('maps token limits and falls back safely for malformed tool JSON', async () => {
    const events = await collect(
      deepSeekChunksToEvents(
        iterate([
          chunk(
            {
              tool_calls: [
                {
                  index: 0,
                  id: 'call-1',
                  function: { name: 'Read', arguments: '{invalid' },
                },
              ],
            },
            {},
            'length',
          ),
        ]),
        DEFAULT_DEEPSEEK_MODEL,
      ),
    )
    const final = events.at(-1)
    if (final?.type !== 'assistant') throw new Error('Missing assistant message')
    expect(final.apiError).toBe('max_output_tokens')
    expect(final.message.stop_reason).toBe('max_tokens')
    expect(final.message.content[0]).toMatchObject({
      input: { __invalid_tool_json__: '{invalid' },
    })
  })

  it('rejects empty and usage-only responses instead of emitting invalid messages', async () => {
    await expect(
      collect(deepSeekChunksToEvents(iterate([]), DEFAULT_DEEPSEEK_MODEL)),
    ).rejects.toThrow('DeepSeek returned an empty response')
    await expect(
      collect(
        deepSeekChunksToEvents(
          iterate([
            chunk({}, {
              choices: [],
              usage: {
                prompt_tokens: 1,
                completion_tokens: 0,
                total_tokens: 1,
              },
            }),
          ]),
          DEFAULT_DEEPSEEK_MODEL,
        ),
      ),
    ).rejects.toThrow('DeepSeek returned an empty response')
  })

  it('defaults a content response without a finish reason to end_turn', async () => {
    const events = await collect(
      deepSeekChunksToEvents(
        iterate([chunk({ content: 'Tayyor' })]),
        DEFAULT_DEEPSEEK_MODEL,
      ),
    )
    const final = events.at(-1)
    if (final?.type !== 'assistant') throw new Error('Missing assistant message')
    expect(final.message.stop_reason).toBe('end_turn')
  })
})

describe('DeepSeek tool name mapping', () => {
  it('sanitizes names and reversibly resolves collisions', () => {
    const originalNames = ['mcp.server/tool', 'mcp.server:tool', 'x'.repeat(80)]
    const mapper = createToolNameMapper(originalNames)
    const mappedNames = originalNames.map(name => mapper.toDeepSeekName(name))
    expect(new Set(mappedNames).size).toBe(originalNames.length)
    for (const [index, name] of mappedNames.entries()) {
      expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/)
      expect(mapper.toOriginalName(name)).toBe(originalNames[index])
    }
  })
})
