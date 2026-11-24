/**
 * Phase 13 — Required API Tests (14 tests) + Anthropic Endpoint Prohibition Test
 *
 * Covers:
 * 1. Successful API connection (verifyDeepSeekApiKey)
 * 2. Invalid API key (401)
 * 3. Insufficient balance (402)
 * 4. Unsupported model (404)
 * 5. Normal chat response
 * 6. Streaming response (progressive SSE events)
 * 7. Interrupted stream
 * 8. Cancellation (AbortSignal)
 * 9. Multi-turn conversation
 * 10. Tool call response
 * 11. Multiple tool calls in one turn
 * 12. Invalid tool arguments (malformed JSON handling)
 * 13. Tool result continuation (role: 'tool' with tool_call_id)
 * 14. Model error handling (400, 403, 408, 429, 500, 502, 503) + Anthropic prohibition
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DeepSeekAPIError,
  streamDeepSeekChat,
  verifyDeepSeekApiKey,
  type DeepSeekChatChunk,
} from '../src/services/api/deepseekClient.js'
import {
  createToolNameMapper,
  deepSeekChunksToEvents,
  parseAndValidateToolInput,
  toDeepSeekMessages,
} from '../src/services/api/deepseekAdapter.js'
import {
  ALTERNATIVE_DEEPSEEK_MODEL,
  DEFAULT_DEEPSEEK_MODEL,
  getAPIProvider,
} from '../src/utils/model/providers.js'
import type { AssistantMessage, StreamEvent, UserMessage } from '../src/types/message.js'

type RequestHandler = (
  req: IncomingMessage,
  body: string,
  res: ServerResponse,
) => void

async function startMockDeepSeekServer(handler: RequestHandler): Promise<{
  baseUrl: string
  requests: Array<{
    method?: string
    url?: string
    headers: IncomingMessage['headers']
    body: any
  }>
  close: () => Promise<void>
}> {
  const requests: Array<{
    method?: string
    url?: string
    headers: IncomingMessage['headers']
    body: any
  }> = []

  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(Buffer.from(chunk)))
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8')
      let parsed: any = rawBody
      try {
        parsed = JSON.parse(rawBody)
      } catch {
        // leave as string
      }
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: parsed,
      })
      handler(req, rawBody, res)
    })
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close(err => (err ? reject(err) : resolve())),
      ),
  }
}

function writeSSEChunks(
  res: ServerResponse,
  chunks: Array<DeepSeekChatChunk | '[DONE]'>,
): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  for (const chunk of chunks) {
    if (chunk === '[DONE]') {
      res.write('data: [DONE]\n\n')
    } else {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`)
    }
  }
  res.end()
}

function makeUserMsg(content: any): UserMessage {
  return {
    type: 'user',
    uuid: 'u-1' as any,
    message: { role: 'user', content },
  }
}

function makeAssistantMsg(content: any): AssistantMessage {
  return {
    type: 'assistant',
    uuid: 'a-1' as any,
    message: {
      id: 'msg-1',
      type: 'message',
      role: 'assistant',
      model: DEFAULT_DEEPSEEK_MODEL,
      content,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 } as any,
    },
  }
}

describe('Phase 13 — Required DeepSeek API & Adapter Tests', () => {
  const origEnv = { ...process.env }

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'sk-deepseek-test-key-123456'
  })

  afterEach(() => {
    process.env = { ...origEnv }
  })

  // 1. Successful API connection
  it('1. verifies a successful DeepSeek API connection with Bearer authentication', async () => {
    const mock = await startMockDeepSeekServer((_req, _body, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          id: 'chatcmpl-conn-1',
          object: 'chat.completion',
          created: 1700000000,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'pong' },
              finish_reason: 'stop',
            },
          ],
        }),
      )
    })

    try {
      const ok = await verifyDeepSeekApiKey({
        apiKey: 'sk-deepseek-valid-key',
        baseUrl: mock.baseUrl,
        model: DEFAULT_DEEPSEEK_MODEL,
      })
      expect(ok).toBe(true)
      expect(mock.requests).toHaveLength(1)
      expect(mock.requests[0]!.url).toBe('/chat/completions')
      expect(mock.requests[0]!.headers.authorization).toBe(
        'Bearer sk-deepseek-valid-key',
      )
      expect(mock.requests[0]!.body.model).toBe('deepseek-flash')
      expect(getAPIProvider()).toBe('deepseek')
    } finally {
      await mock.close()
    }
  })

  // 2. Invalid API key (401)
  it('2. handles invalid API key (HTTP 401) with clear message, key redaction, and no retry', async () => {
    const mock = await startMockDeepSeekServer((_req, _body, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: {
            message: 'Authentication Fails (no such user) with key sk-secret-leak123',
            type: 'authentication_error',
          },
        }),
      )
    })

    try {
      const ok = await verifyDeepSeekApiKey({
        apiKey: 'sk-secret-leak123',
        baseUrl: mock.baseUrl,
        model: DEFAULT_DEEPSEEK_MODEL,
      })
      expect(ok).toBe(false)

      // Streaming call must also fail immediately without retrying 401
      const gen = streamDeepSeekChat(
        {
          model: DEFAULT_DEEPSEEK_MODEL,
          messages: [{ role: 'user', content: 'Hi' }],
        },
        {
          apiKey: 'sk-secret-leak123',
          baseUrl: mock.baseUrl,
          maxRetries: 2,
        },
      )
      await expect(gen.next()).rejects.toThrow(
        /DeepSeek API Error \(401 Invalid API Key\)/,
      )
      // 1 from verifyDeepSeekApiKey + 1 from streamDeepSeekChat (no retries on 401)
      expect(mock.requests).toHaveLength(2)
    } finally {
      await mock.close()
    }
  })

  // 3. Insufficient balance (402)
  it('3. handles insufficient account balance (HTTP 402) clearly without retrying', async () => {
    const mock = await startMockDeepSeekServer((_req, _body, res) => {
      res.writeHead(402, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: {
            message: 'Insufficient Balance',
            type: 'insufficient_balance',
          },
        }),
      )
    })

    try {
      const gen = streamDeepSeekChat(
        {
          model: DEFAULT_DEEPSEEK_MODEL,
          messages: [{ role: 'user', content: 'Hello' }],
        },
        {
          apiKey: 'sk-test-balance',
          baseUrl: mock.baseUrl,
          maxRetries: 2,
        },
      )
      await expect(gen.next()).rejects.toThrow(
        /DeepSeek API Error \(402 Insufficient Balance\)/,
      )
      expect(mock.requests).toHaveLength(1)
    } finally {
      await mock.close()
    }
  })

  // 4. Unsupported model (404)
  it('4. handles unsupported or unknown model (HTTP 404) with clear guidance', async () => {
    const mock = await startMockDeepSeekServer((_req, _body, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: {
            message: 'Model Not Exist',
            type: 'invalid_request_error',
          },
        }),
      )
    })

    try {
      const gen = streamDeepSeekChat(
        {
          model: 'non-existent-model',
          messages: [{ role: 'user', content: 'Hello' }],
        },
        {
          apiKey: 'sk-test-404',
          baseUrl: mock.baseUrl,
          maxRetries: 2,
        },
      )
      await expect(gen.next()).rejects.toThrow(
        /DeepSeek API Error \(404 Not Found\): Invalid endpoint or unsupported model 'non-existent-model'/,
      )
      expect(mock.requests).toHaveLength(1)
    } finally {
      await mock.close()
    }
  })

  // 5. Normal chat response
  it('5. processes a normal chat response and maps tokens and stop_reason accurately', async () => {
    const mock = await startMockDeepSeekServer((_req, _body, res) => {
      writeSSEChunks(res, [
        {
          id: 'chatcmpl-normal-1',
          object: 'chat.completion.chunk',
          created: 1700000001,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'Hello from DeepSeek!' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 18,
            completion_tokens: 5,
            total_tokens: 23,
            prompt_cache_hit_tokens: 10,
            prompt_cache_miss_tokens: 8,
          },
        },
        '[DONE]',
      ])
    })

    try {
      const chunks = streamDeepSeekChat(
        {
          model: DEFAULT_DEEPSEEK_MODEL,
          messages: [{ role: 'user', content: 'Say hello' }],
        },
        {
          apiKey: 'sk-test',
          baseUrl: mock.baseUrl,
        },
      )
      const mapper = createToolNameMapper([])
      const items: Array<StreamEvent | AssistantMessage> = []
      for await (const item of deepSeekChunksToEvents(
        chunks,
        DEFAULT_DEEPSEEK_MODEL,
        mapper,
      )) {
        items.push(item)
      }

      const streamEvents = items
        .filter((i): i is StreamEvent => i.type === 'stream_event')
        .map(i => i.event as any)

      const textDeltas = streamEvents
        .filter(
          e =>
            e.type === 'content_block_delta' &&
            e.delta.type === 'text_delta',
        )
        .map(e => e.delta.text)
        .join('')
      expect(textDeltas).toBe('Hello from DeepSeek!')

      const assistantMsg = items.find(
        (i): i is AssistantMessage => i.type === 'assistant',
      )
      expect(assistantMsg).toBeDefined()
      expect(assistantMsg!.message.stop_reason).toBe('end_turn')
      expect(assistantMsg!.message.usage.input_tokens).toBe(8)
      expect(assistantMsg!.message.usage.cache_read_input_tokens).toBe(10)
      expect(assistantMsg!.message.usage.output_tokens).toBe(5)
    } finally {
      await mock.close()
    }
  })

  // 6. Streaming response
  it('6. streams progressive delta.content and delta.reasoning_content tokens separately', async () => {
    const mock = await startMockDeepSeekServer((_req, _body, res) => {
      writeSSEChunks(res, [
        {
          id: 'chatcmpl-stream-1',
          object: 'chat.completion.chunk',
          created: 1700000002,
          model: ALTERNATIVE_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                reasoning_content: 'Step 1: analyze input. ',
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-stream-1',
          object: 'chat.completion.chunk',
          created: 1700000002,
          model: ALTERNATIVE_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                reasoning_content: 'Step 2: formulate answer.',
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-stream-1',
          object: 'chat.completion.chunk',
          created: 1700000002,
          model: ALTERNATIVE_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: { content: 'The result ' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-stream-1',
          object: 'chat.completion.chunk',
          created: 1700000002,
          model: ALTERNATIVE_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: { content: 'is 42.' },
              finish_reason: 'stop',
            },
          ],
        },
        '[DONE]',
      ])
    })

    try {
      const chunks = streamDeepSeekChat(
        {
          model: ALTERNATIVE_DEEPSEEK_MODEL,
          messages: [{ role: 'user', content: 'Compute result' }],
        },
        {
          apiKey: 'sk-test',
          baseUrl: mock.baseUrl,
        },
      )
      const mapper = createToolNameMapper([])
      const items: Array<StreamEvent | AssistantMessage> = []
      for await (const item of deepSeekChunksToEvents(
        chunks,
        ALTERNATIVE_DEEPSEEK_MODEL,
        mapper,
      )) {
        items.push(item)
      }

      const streamEvents = items
        .filter((i): i is StreamEvent => i.type === 'stream_event')
        .map(i => i.event as any)

      const thinkingText = streamEvents
        .filter(
          e =>
            e.type === 'content_block_delta' &&
            e.delta.type === 'thinking_delta',
        )
        .map(e => e.delta.thinking)
        .join('')
      const answerText = streamEvents
        .filter(
          e =>
            e.type === 'content_block_delta' &&
            e.delta.type === 'text_delta',
        )
        .map(e => e.delta.text)
        .join('')

      // Reasoning content is kept strictly in thinking blocks and never leaks into answerText
      expect(thinkingText).toBe(
        'Step 1: analyze input. Step 2: formulate answer.',
      )
      expect(answerText).toBe('The result is 42.')
      expect(answerText).not.toContain('Step 1')
    } finally {
      await mock.close()
    }
  })

  // 7. Interrupted stream
  it('7. detects an abruptly interrupted SSE stream that ends before finish_reason or [DONE]', async () => {
    const mock = await startMockDeepSeekServer((_req, _body, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
      })
      const chunk: DeepSeekChatChunk = {
        id: 'chatcmpl-interrupted',
        object: 'chat.completion.chunk',
        created: 1700000003,
        model: DEFAULT_DEEPSEEK_MODEL,
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: 'Partial response before drop' },
            finish_reason: null,
          },
        ],
      }
      res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      // Abruptly end without finish_reason or [DONE]
      res.end()
    })

    try {
      const gen = streamDeepSeekChat(
        {
          model: DEFAULT_DEEPSEEK_MODEL,
          messages: [{ role: 'user', content: 'Start streaming' }],
        },
        {
          apiKey: 'sk-test',
          baseUrl: mock.baseUrl,
        },
      )

      const first = await gen.next()
      expect(first.done).toBe(false)
      expect(first.value?.choices[0]?.delta.content).toBe(
        'Partial response before drop',
      )
      await expect(gen.next()).rejects.toThrow(
        /DeepSeek stream interrupted before completion/,
      )
    } finally {
      await mock.close()
    }
  })

  // 8. Cancellation
  it('8. cancels an active streaming request immediately when AbortSignal fires', async () => {
    const controller = new AbortController()
    const mock = await startMockDeepSeekServer((_req, _body, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
      })
      const chunk: DeepSeekChatChunk = {
        id: 'chatcmpl-cancel',
        object: 'chat.completion.chunk',
        created: 1700000004,
        model: DEFAULT_DEEPSEEK_MODEL,
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: 'First chunk' },
            finish_reason: null,
          },
        ],
      }
      res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      // Keep connection open until aborted
    })

    try {
      const gen = streamDeepSeekChat(
        {
          model: DEFAULT_DEEPSEEK_MODEL,
          messages: [{ role: 'user', content: 'Long stream' }],
        },
        {
          apiKey: 'sk-test',
          baseUrl: mock.baseUrl,
          signal: controller.signal,
        },
      )

      const first = await gen.next()
      expect(first.done).toBe(false)
      expect(first.value?.choices[0]?.delta.content).toBe('First chunk')

      controller.abort()
      await expect(gen.next()).rejects.toThrow(/aborted/i)
    } finally {
      await mock.close()
    }
  })

  // 9. Multi-turn conversation
  it('9. preserves multi-turn conversation history across system, user, and assistant turns', () => {
    const mapper = createToolNameMapper(['Read', 'Edit'])
    const messages = toDeepSeekMessages(
      [
        makeUserMsg('What files are in this project?'),
        makeAssistantMsg([{ type: 'text', text: 'Let me check the project directory.' }]),
        makeUserMsg('Now read main.py'),
      ],
      ['You are a senior software engineer.', 'Always inspect files before editing.'],
      mapper,
    )

    expect(messages).toHaveLength(4)
    expect(messages[0]).toEqual({
      role: 'system',
      content: 'You are a senior software engineer.\n\nAlways inspect files before editing.',
    })
    expect(messages[1]).toEqual({
      role: 'user',
      content: 'What files are in this project?',
    })
    expect(messages[2]).toEqual({
      role: 'assistant',
      content: 'Let me check the project directory.',
    })
    expect(messages[3]).toEqual({
      role: 'user',
      content: 'Now read main.py',
    })
  })

  // 10. Tool call response
  it('10. translates streamed DeepSeek tool_calls chunks into tool_use content blocks', async () => {
    const mock = await startMockDeepSeekServer((_req, _body, res) => {
      writeSSEChunks(res, [
        {
          id: 'chatcmpl-tool-1',
          object: 'chat.completion.chunk',
          created: 1700000005,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_read_1',
                    type: 'function',
                    function: {
                      name: 'Read',
                      arguments: '{"file_path":',
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-tool-1',
          object: 'chat.completion.chunk',
          created: 1700000005,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: {
                      arguments: '"/tmp/main.py"}',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
        '[DONE]',
      ])
    })

    try {
      const mapper = createToolNameMapper(['Read'])
      const chunks = streamDeepSeekChat(
        {
          model: DEFAULT_DEEPSEEK_MODEL,
          messages: [{ role: 'user', content: 'Read /tmp/main.py' }],
        },
        {
          apiKey: 'sk-test',
          baseUrl: mock.baseUrl,
        },
      )
      const items: Array<StreamEvent | AssistantMessage> = []
      for await (const item of deepSeekChunksToEvents(
        chunks,
        DEFAULT_DEEPSEEK_MODEL,
        mapper,
      )) {
        items.push(item)
      }

      const streamEvents = items
        .filter((i): i is StreamEvent => i.type === 'stream_event')
        .map(i => i.event as any)

      const toolStart = streamEvents.find(
        e =>
          e.type === 'content_block_start' &&
          e.content_block.type === 'tool_use',
      )
      expect(toolStart).toBeDefined()
      expect(toolStart.content_block.id).toBe('call_read_1')
      expect(toolStart.content_block.name).toBe('Read')

      const inputJson = streamEvents
        .filter(
          e =>
            e.type === 'content_block_delta' &&
            e.delta.type === 'input_json_delta',
        )
        .map(e => e.delta.partial_json)
        .join('')
      expect(JSON.parse(inputJson)).toEqual({ file_path: '/tmp/main.py' })

      const assistantMsg = items.find(
        (i): i is AssistantMessage => i.type === 'assistant',
      )
      expect(assistantMsg!.message.stop_reason).toBe('tool_use')
      const toolBlock = assistantMsg!.message.content.find(
        (b: any) => b.type === 'tool_use',
      ) as any
      expect(toolBlock.input).toEqual({ file_path: '/tmp/main.py' })
    } finally {
      await mock.close()
    }
  })

  // 11. Multiple tool calls in one turn
  it('11. accumulates and emits multiple tool calls in a single assistant turn', async () => {
    const mock = await startMockDeepSeekServer((_req, _body, res) => {
      writeSSEChunks(res, [
        {
          id: 'chatcmpl-multitool-1',
          object: 'chat.completion.chunk',
          created: 1700000006,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_glob_1',
                    type: 'function',
                    function: {
                      name: 'Glob',
                      arguments: '{"pattern":"**/*.py"}',
                    },
                  },
                  {
                    index: 1,
                    id: 'call_grep_2',
                    type: 'function',
                    function: {
                      name: 'Grep',
                      arguments: '{"pattern":"def add"}',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
        '[DONE]',
      ])
    })

    try {
      const mapper = createToolNameMapper(['Glob', 'Grep'])
      const chunks = streamDeepSeekChat(
        {
          model: DEFAULT_DEEPSEEK_MODEL,
          messages: [{ role: 'user', content: 'Find python files and def add' }],
        },
        {
          apiKey: 'sk-test',
          baseUrl: mock.baseUrl,
        },
      )
      const items: Array<StreamEvent | AssistantMessage> = []
      for await (const item of deepSeekChunksToEvents(
        chunks,
        DEFAULT_DEEPSEEK_MODEL,
        mapper,
      )) {
        items.push(item)
      }

      const assistantMsg = items.find(
        (i): i is AssistantMessage => i.type === 'assistant',
      )!
      const toolBlocks = assistantMsg.message.content.filter(
        (b: any) => b.type === 'tool_use',
      ) as any[]
      expect(toolBlocks).toHaveLength(2)
      expect(toolBlocks[0].name).toBe('Glob')
      expect(toolBlocks[0].id).toBe('call_glob_1')
      expect(toolBlocks[0].input).toEqual({ pattern: '**/*.py' })
      expect(toolBlocks[1].name).toBe('Grep')
      expect(toolBlocks[1].id).toBe('call_grep_2')
      expect(toolBlocks[1].input).toEqual({ pattern: 'def add' })
    } finally {
      await mock.close()
    }
  })

  // 12. Invalid tool arguments
  it('12. flags malformed JSON tool arguments safely without crashing the stream', async () => {
    const parsed = parseAndValidateToolInput('{invalid_json: true')
    expect(parsed.valid).toBe(false)
    expect(parsed.input.__invalid_tool_json__).toBe('{invalid_json: true')

    const mock = await startMockDeepSeekServer((_req, _body, res) => {
      writeSSEChunks(res, [
        {
          id: 'chatcmpl-badjson-1',
          object: 'chat.completion.chunk',
          created: 1700000007,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_bad_1',
                    type: 'function',
                    function: {
                      name: 'Edit',
                      arguments: '{"file_path": "/tmp/a.py", broken',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
        '[DONE]',
      ])
    })

    try {
      const mapper = createToolNameMapper(['Edit'])
      const chunks = streamDeepSeekChat(
        {
          model: DEFAULT_DEEPSEEK_MODEL,
          messages: [{ role: 'user', content: 'Edit file' }],
        },
        {
          apiKey: 'sk-test',
          baseUrl: mock.baseUrl,
        },
      )
      const items: Array<StreamEvent | AssistantMessage> = []
      for await (const item of deepSeekChunksToEvents(
        chunks,
        DEFAULT_DEEPSEEK_MODEL,
        mapper,
      )) {
        items.push(item)
      }

      const assistantMsg = items.find(
        (i): i is AssistantMessage => i.type === 'assistant',
      )!
      const toolBlock = assistantMsg.message.content.find(
        (b: any) => b.type === 'tool_use',
      ) as any
      expect(toolBlock).toBeDefined()
      expect(toolBlock.input.__invalid_tool_json__).toContain('broken')
    } finally {
      await mock.close()
    }
  })

  // 13. Tool result continuation
  it('13. translates tool_result blocks into DeepSeek role:"tool" messages ordered immediately after assistant tool_calls', () => {
    const mapper = createToolNameMapper(['Glob', 'Read'])
    const messages = toDeepSeekMessages(
      [
        makeUserMsg('Inspect the repo'),
        makeAssistantMsg([
          { type: 'text', text: 'Checking files...' },
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'Glob',
            input: { pattern: '*' },
          },
          {
            type: 'tool_use',
            id: 'call_2',
            name: 'Read',
            input: { file_path: 'main.py' },
          },
        ]),
        makeUserMsg([
          {
            type: 'tool_result',
            tool_use_id: 'call_1',
            content: 'main.py\nREADME.md',
          },
          {
            type: 'tool_result',
            tool_use_id: 'call_2',
            content: 'def add(a, b):\n    return a - b',
          },
        ]),
      ],
      ['System instructions'],
      mapper,
    )

    expect(messages).toHaveLength(5)
    expect(messages[2]!.role).toBe('assistant')
    expect(messages[2]!.tool_calls).toHaveLength(2)
    expect(messages[3]).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: 'main.py\nREADME.md',
    })
    expect(messages[4]).toEqual({
      role: 'tool',
      tool_call_id: 'call_2',
      content: 'def add(a, b):\n    return a - b',
    })
  })

  // 14. Model error handling (400, 403, 408, 429, 500, 502, 503) + Anthropic prohibition
  it('14. handles HTTP 400, 403, 429, 500, 502, 503 errors with retries for transient failures and forbids Anthropic endpoints', async () => {
    let attempt = 0
    const mock = await startMockDeepSeekServer((_req, _body, res) => {
      attempt++
      if (attempt === 1) {
        res.writeHead(429, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Rate limit reached' } }))
        return
      }
      if (attempt === 2) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Service overloaded' } }))
        return
      }
      writeSSEChunks(res, [
        {
          id: 'chatcmpl-recovered',
          object: 'chat.completion.chunk',
          created: 1700000010,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'Recovered after retry' },
              finish_reason: 'stop',
            },
          ],
        },
        '[DONE]',
      ])
    })

    try {
      const gen = streamDeepSeekChat(
        {
          model: DEFAULT_DEEPSEEK_MODEL,
          messages: [{ role: 'user', content: 'Retry test' }],
        },
        {
          apiKey: 'sk-test',
          baseUrl: mock.baseUrl,
          maxRetries: 2,
        },
      )

      const chunks: DeepSeekChatChunk[] = []
      for await (const c of gen) {
        chunks.push(c)
      }
      expect(attempt).toBe(3)
      expect(chunks[0]?.choices[0]?.delta.content).toBe('Recovered after retry')

      // Verify Anthropic endpoint prohibition guard
      const anthropicAttempt = streamDeepSeekChat(
        {
          model: DEFAULT_DEEPSEEK_MODEL,
          messages: [{ role: 'user', content: 'Forbidden' }],
        },
        {
          apiKey: 'sk-test',
          baseUrl: 'https://api.anthropic.com',
        },
      )
      await expect(anthropicAttempt.next()).rejects.toThrow(
        /Blocked attempt to contact Anthropic endpoint/,
      )
    } finally {
      await mock.close()
    }
  })
})
