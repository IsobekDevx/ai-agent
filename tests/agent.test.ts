/**
 * Phase 13 — Required Agent Tests (15 tests)
 *
 * Covers:
 * 1. List files (GlobTool)
 * 2. Read files (FileReadTool)
 * 3. Search code (GrepTool)
 * 4. Inspect project (Multi-tool project inspection via QueryEngine)
 * 5. Generate code (DeepSeek model generates code via QueryEngine)
 * 6. Edit one file (FileEditTool)
 * 7. Edit multiple files (Sequential FileEditTool calls across multiple files)
 * 8. Create a file (FileWriteTool)
 * 9. Delete a file with approval (BashTool with permission callback)
 * 10. Reject a proposed change (canUseTool returns deny -> file remains unchanged)
 * 11. Apply an approved change (canUseTool returns allow -> file is updated on disk)
 * 12. Detect conflicting modifications (file modified after read -> errorCode 7)
 * 13. Run an approved terminal command (BashTool execution)
 * 14. Handle tool execution failure (is_error: true tool_result returned to model)
 * 15. Continue an agent task after tool results across multiple rounds
 */
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QueryEngine } from '../src/QueryEngine.js'
import { getDefaultAppState, type AppState } from '../src/state/AppStateStore.js'
import { getAllBaseTools } from '../src/tools.js'
import { BashTool } from '../src/tools/BashTool/BashTool.js'
import { FileEditTool } from '../src/tools/FileEditTool/FileEditTool.js'
import { FileReadTool } from '../src/tools/FileReadTool/FileReadTool.js'
import { FileWriteTool } from '../src/tools/FileWriteTool/FileWriteTool.js'
import { GlobTool } from '../src/tools/GlobTool/GlobTool.js'
import { GrepTool } from '../src/tools/GrepTool/GrepTool.js'
import { createFileStateCacheWithSizeLimit } from '../src/utils/fileStateCache.js'

const createFileStateCache = () => createFileStateCacheWithSizeLimit(100)
const dummyParentMsg: any = {
  type: 'assistant',
  uuid: 'a-test',
  message: { id: 'msg-test', role: 'assistant', content: [] },
}
import { setCwd } from '../src/utils/Shell.js'
import { DEFAULT_DEEPSEEK_MODEL } from '../src/utils/model/providers.js'
import type { DeepSeekChatChunk } from '../src/services/api/deepseekClient.js'
import type { ToolUseContext } from '../src/Tool.js'

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

async function startScriptedDeepSeekServer(
  turns: Array<(reqBody: any) => DeepSeekChatChunk[]>,
): Promise<{
  baseUrl: string
  requests: any[]
  close: () => Promise<void>
}> {
  const requests: any[] = []
  let turnIndex = 0

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(Buffer.from(c)))
    req.on('end', () => {
      const bodyStr = Buffer.concat(chunks).toString('utf8')
      let parsed: any = {}
      try {
        parsed = JSON.parse(bodyStr)
      } catch {
        // ignore
      }
      requests.push(parsed)
      const handler =
        turns[Math.min(turnIndex, turns.length - 1)] ??
        (() => [
          {
            id: `chatcmpl-fallback-${turnIndex}`,
            object: 'chat.completion.chunk',
            created: 1700000000,
            model: DEFAULT_DEEPSEEK_MODEL,
            choices: [
              {
                index: 0,
                delta: { role: 'assistant', content: 'Done.' },
                finish_reason: 'stop',
              },
            ],
          },
        ])
      turnIndex++
      const sseChunks = handler(parsed)
      writeSSEChunks(res, [...sseChunks, '[DONE]'])
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

function createTestToolContext(cwd: string): ToolUseContext {
  let appState: AppState = getDefaultAppState()
  const readFileState = createFileStateCache()
  const tools = [GlobTool, FileReadTool, GrepTool, FileEditTool, FileWriteTool, BashTool]
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: DEFAULT_DEEPSEEK_MODEL,
      tools,
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
    },
    abortController: new AbortController(),
    readFileState,
    getAppState: () => appState,
    setAppState: fn => {
      appState = fn(appState)
    },
    messages: [],
    setMessages: () => {},
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
  }
}

describe('Phase 13 — Required Agent Tests (15 Tests)', () => {
  let tempDir: string
  const origEnv = { ...process.env }
  const origCwd = process.cwd()

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'claude-deepseek-agent-test-'))
    setCwd(tempDir)
    process.env.DEEPSEEK_API_KEY = 'sk-deepseek-agent-test-key'
    process.env.CLAUDE_CODE_SIMPLE = '1'
  })

  afterEach(() => {
    setCwd(origCwd)
    process.env = { ...origEnv }
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  })

  // 1. List files
  it('1. lists project files using GlobTool', async () => {
    writeFileSync(join(tempDir, 'alpha.py'), 'print("alpha")\n')
    writeFileSync(join(tempDir, 'beta.py'), 'print("beta")\n')
    mkdirSync(join(tempDir, 'src'), { recursive: true })
    writeFileSync(join(tempDir, 'src', 'gamma.ts'), 'export const x = 1\n')

    const ctx = createTestToolContext(tempDir)
    const res = await GlobTool.call({ pattern: '**/*.py', path: tempDir }, ctx, async () => ({ behavior: 'allow', updatedInput: {} }), dummyParentMsg)
    expect(res.data.numFiles).toBe(2)
    expect(res.data.filenames.map((f: string) => f.replace(/\\/g, '/'))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('alpha.py'),
        expect.stringContaining('beta.py'),
      ]),
    )
  })

  // 2. Read files
  it('2. reads file contents and populates readFileState cache using FileReadTool', async () => {
    const filePath = join(tempDir, 'sample.py')
    writeFileSync(filePath, 'def greet(name):\n    return f"Hello, {name}"\n')

    const ctx = createTestToolContext(tempDir)
    const res = await FileReadTool.call(
      { file_path: filePath },
      ctx,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      dummyParentMsg,
    )
    expect(res.data.type).toBe('text')
    if (res.data.type === 'text') {
      expect(res.data.file.content).toContain('def greet(name):')
    }
    expect(ctx.readFileState.get(filePath)).toBeDefined()
  })

  // 3. Search code
  it('3. searches source code across files using GrepTool', async () => {
    writeFileSync(
      join(tempDir, 'math_utils.py'),
      'def calculate_hypotenuse(a, b):\n    return (a**2 + b**2) ** 0.5\n',
    )
    writeFileSync(join(tempDir, 'other.py'), 'def noop():\n    pass\n')

    const ctx = createTestToolContext(tempDir)
    const res = await GrepTool.call(
      {
        pattern: 'calculate_hypotenuse',
        path: tempDir,
        output_mode: 'content',
      },
      ctx,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      dummyParentMsg,
    )
    expect(res.data.content).toContain('calculate_hypotenuse')
    expect(res.data.content).toContain('math_utils.py')
  })

  // 4. Inspect project
  it('4. inspects a project end-to-end through QueryEngine using Glob and Read tool calls', async () => {
    const filePath = join(tempDir, 'app.py')
    writeFileSync(filePath, 'VERSION = "1.2.3"\n')

    const mock = await startScriptedDeepSeekServer([
      // Turn 1: call Glob
      () => [
        {
          id: 'chatcmpl-inspect-1',
          object: 'chat.completion.chunk',
          created: 1700000100,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_glob_inspect',
                    type: 'function',
                    function: {
                      name: 'Glob',
                      arguments: JSON.stringify({ pattern: '*.py', path: tempDir }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ],
      // Turn 2: call Read on app.py
      () => [
        {
          id: 'chatcmpl-inspect-2',
          object: 'chat.completion.chunk',
          created: 1700000101,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_read_inspect',
                    type: 'function',
                    function: {
                      name: 'Read',
                      arguments: JSON.stringify({ file_path: filePath }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ],
      // Turn 3: summarize project
      () => [
        {
          id: 'chatcmpl-inspect-3',
          object: 'chat.completion.chunk',
          created: 1700000102,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                content: 'The project contains app.py with VERSION = "1.2.3".',
              },
              finish_reason: 'stop',
            },
          ],
        },
      ],
    ])

    process.env.DEEPSEEK_BASE_URL = mock.baseUrl

    try {
      let appState = getDefaultAppState()
      const engine = new QueryEngine({
        cwd: tempDir,
        tools: [GlobTool, FileReadTool],
        commands: [],
        mcpClients: [],
        agents: [],
        canUseTool: async (_tool, input) => ({
          behavior: 'allow',
          updatedInput: input,
        }),
        getAppState: () => appState,
        setAppState: fn => {
          appState = fn(appState)
        },
        readFileCache: createFileStateCache(),
        customSystemPrompt: 'You are a coding assistant.',
      })

      const events: any[] = []
      for await (const ev of engine.submitMessage('Inspect the project')) {
        events.push(ev)
      }

      expect(mock.requests).toHaveLength(3)
      const resultEvent = events.find(e => e.type === 'result')
      expect(resultEvent).toBeDefined()
      expect(resultEvent.result).toContain('VERSION = "1.2.3"')
    } finally {
      await mock.close()
    }
  })

  // 5. Generate code
  it('5. generates code responses through QueryEngine', async () => {
    const mock = await startScriptedDeepSeekServer([
      () => [
        {
          id: 'chatcmpl-gen-1',
          object: 'chat.completion.chunk',
          created: 1700000105,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                content: '```python\ndef fibonacci(n: int) -> int:\n    return n if n <= 1 else fibonacci(n - 1) + fibonacci(n - 2)\n```',
              },
              finish_reason: 'stop',
            },
          ],
        },
      ],
    ])
    process.env.DEEPSEEK_BASE_URL = mock.baseUrl

    try {
      let appState = getDefaultAppState()
      const engine = new QueryEngine({
        cwd: tempDir,
        tools: [],
        commands: [],
        mcpClients: [],
        agents: [],
        canUseTool: async (_t, input) => ({ behavior: 'allow', updatedInput: input }),
        getAppState: () => appState,
        setAppState: fn => {
          appState = fn(appState)
        },
        readFileCache: createFileStateCache(),
        customSystemPrompt: 'Generate clean Python code.',
      })

      const events: any[] = []
      for await (const ev of engine.submitMessage('Write a fibonacci function')) {
        events.push(ev)
      }
      const resultEvent = events.find(e => e.type === 'result')
      expect(resultEvent.result).toContain('def fibonacci(n: int)')
    } finally {
      await mock.close()
    }
  })

  // 6. Edit one file
  it('6. edits a single file accurately after reading it', async () => {
    const filePath = join(tempDir, 'calc.py')
    writeFileSync(filePath, 'def multiply(a, b):\n    return a + b\n')

    const ctx = createTestToolContext(tempDir)
    await FileReadTool.call(
      { file_path: filePath },
      ctx,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      dummyParentMsg,
    )

    const validation = await FileEditTool.validateInput(
      {
        file_path: filePath,
        old_string: 'return a + b',
        new_string: 'return a * b',
      },
      ctx,
    )
    expect(validation.result).toBe(true)

    const editRes = await FileEditTool.call(
      {
        file_path: filePath,
        old_string: 'return a + b',
        new_string: 'return a * b',
      },
      ctx,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      dummyParentMsg,
    )

    expect(editRes.data.structuredPatch).toHaveLength(1)
    expect(readFileSync(filePath, 'utf8')).toBe(
      'def multiply(a, b):\n    return a * b\n',
    )
  })

  // 7. Edit multiple files
  it('7. edits multiple files in a multi-step task', async () => {
    const fileA = join(tempDir, 'a.py')
    const fileB = join(tempDir, 'b.py')
    writeFileSync(fileA, 'VALUE_A = 1\n')
    writeFileSync(fileB, 'VALUE_B = 2\n')

    const ctx = createTestToolContext(tempDir)
    await FileReadTool.call(
      { file_path: fileA },
      ctx,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      dummyParentMsg,
    )
    await FileReadTool.call(
      { file_path: fileB },
      ctx,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      dummyParentMsg,
    )

    await FileEditTool.call(
      {
        file_path: fileA,
        old_string: 'VALUE_A = 1',
        new_string: 'VALUE_A = 10',
      },
      ctx,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      dummyParentMsg,
    )
    await FileEditTool.call(
      {
        file_path: fileB,
        old_string: 'VALUE_B = 2',
        new_string: 'VALUE_B = 20',
      },
      ctx,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      dummyParentMsg,
    )

    expect(readFileSync(fileA, 'utf8')).toBe('VALUE_A = 10\n')
    expect(readFileSync(fileB, 'utf8')).toBe('VALUE_B = 20\n')
  })

  // 8. Create a file
  it('8. creates a new file on disk using FileWriteTool', async () => {
    const newFile = join(tempDir, 'created.py')
    const ctx = createTestToolContext(tempDir)

    const res = await FileWriteTool.call(
      {
        file_path: newFile,
        content: 'def created():\n    return True\n',
      },
      ctx,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      dummyParentMsg,
    )

    expect(res.data.type).toBe('create')
    expect(existsSync(newFile)).toBe(true)
    expect(readFileSync(newFile, 'utf8')).toBe('def created():\n    return True\n')
  })

  // 9. Delete a file with approval
  it('9. deletes a file only when approved through the permission callback', async () => {
    const targetFile = join(tempDir, 'obsolete.txt')
    writeFileSync(targetFile, 'temporary content\n')

    let approved = false
    const mock = await startScriptedDeepSeekServer([
      () => [
        {
          id: 'chatcmpl-del-1',
          object: 'chat.completion.chunk',
          created: 1700000110,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_bash_rm',
                    type: 'function',
                    function: {
                      name: 'Bash',
                      arguments: JSON.stringify({
                        command: `rm -f "${targetFile}"`,
                      }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ],
      () => [
        {
          id: 'chatcmpl-del-2',
          object: 'chat.completion.chunk',
          created: 1700000111,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                content: 'File deleted after approval.',
              },
              finish_reason: 'stop',
            },
          ],
        },
      ],
    ])
    process.env.DEEPSEEK_BASE_URL = mock.baseUrl

    try {
      let appState = getDefaultAppState()
      const engine = new QueryEngine({
        cwd: tempDir,
        tools: [BashTool],
        commands: [],
        mcpClients: [],
        agents: [],
        canUseTool: async (tool, input) => {
          if (tool.name === 'Bash') {
            approved = true
          }
          return { behavior: 'allow', updatedInput: input }
        },
        getAppState: () => appState,
        setAppState: fn => {
          appState = fn(appState)
        },
        readFileCache: createFileStateCache(),
        customSystemPrompt: 'Delete requested file.',
      })

      for await (const _ev of engine.submitMessage('Delete obsolete.txt')) {
        // consume stream
      }

      expect(approved).toBe(true)
      expect(existsSync(targetFile)).toBe(false)
    } finally {
      await mock.close()
    }
  })

  // 10. Reject a proposed change
  it('10. leaves the file on disk completely untouched when the user Rejects a proposed FileEditTool change', async () => {
    const filePath = join(tempDir, 'protected.py')
    const originalContent = 'def add(a, b):\n    return a - b\n'
    writeFileSync(filePath, originalContent)

    const readCache = createFileStateCache()
    const mock = await startScriptedDeepSeekServer([
      // Round 1: Read file
      () => [
        {
          id: 'chatcmpl-rej-1',
          object: 'chat.completion.chunk',
          created: 1700000120,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_read_prot',
                    type: 'function',
                    function: {
                      name: 'Read',
                      arguments: JSON.stringify({ file_path: filePath }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ],
      // Round 2: Propose Edit
      () => [
        {
          id: 'chatcmpl-rej-2',
          object: 'chat.completion.chunk',
          created: 1700000121,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_edit_prot',
                    type: 'function',
                    function: {
                      name: 'Edit',
                      arguments: JSON.stringify({
                        file_path: filePath,
                        old_string: 'return a - b',
                        new_string: 'return a + b',
                      }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ],
      // Round 3: Acknowledge rejection
      () => [
        {
          id: 'chatcmpl-rej-3',
          object: 'chat.completion.chunk',
          created: 1700000122,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                content: 'Understood, I did not apply the edit.',
              },
              finish_reason: 'stop',
            },
          ],
        },
      ],
    ])
    process.env.DEEPSEEK_BASE_URL = mock.baseUrl

    try {
      let appState = getDefaultAppState()
      const engine = new QueryEngine({
        cwd: tempDir,
        tools: [FileReadTool, FileEditTool],
        commands: [],
        mcpClients: [],
        agents: [],
        canUseTool: async (tool, input) => {
          if (tool.name === FileEditTool.name) {
            return {
              behavior: 'deny',
              message: 'User rejected proposed file edit in Diff Preview.',
              reason: { type: 'user_rejected' } as any,
            }
          }
          return { behavior: 'allow', updatedInput: input }
        },
        getAppState: () => appState,
        setAppState: fn => {
          appState = fn(appState)
        },
        readFileCache: readCache,
        customSystemPrompt: 'Fix bugs.',
      })

      const events: any[] = []
      for await (const ev of engine.submitMessage('Fix protected.py')) {
        events.push(ev)
      }

      // Verify file on disk was NOT modified
      expect(readFileSync(filePath, 'utf8')).toBe(originalContent)
      const resultEvent = events.find(e => e.type === 'result')
      expect(resultEvent.permission_denials).toHaveLength(1)
      expect(resultEvent.permission_denials[0].tool_name).toBe('Edit')
    } finally {
      await mock.close()
    }
  })

  // 11. Apply an approved change
  it('11. applies a proposed FileEditTool change to disk when the user Approves (Apply)', async () => {
    const filePath = join(tempDir, 'apply_target.py')
    writeFileSync(filePath, 'def add(a, b):\n    return a - b\n')

    const mock = await startScriptedDeepSeekServer([
      () => [
        {
          id: 'chatcmpl-app-1',
          object: 'chat.completion.chunk',
          created: 1700000130,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_read_app',
                    type: 'function',
                    function: {
                      name: 'Read',
                      arguments: JSON.stringify({ file_path: filePath }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ],
      () => [
        {
          id: 'chatcmpl-app-2',
          object: 'chat.completion.chunk',
          created: 1700000131,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_edit_app',
                    type: 'function',
                    function: {
                      name: 'Edit',
                      arguments: JSON.stringify({
                        file_path: filePath,
                        old_string: 'return a - b',
                        new_string: 'return a + b',
                      }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ],
      () => [
        {
          id: 'chatcmpl-app-3',
          object: 'chat.completion.chunk',
          created: 1700000132,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                content: 'Applied the fix to apply_target.py.',
              },
              finish_reason: 'stop',
            },
          ],
        },
      ],
    ])
    process.env.DEEPSEEK_BASE_URL = mock.baseUrl

    try {
      let appState = getDefaultAppState()
      const engine = new QueryEngine({
        cwd: tempDir,
        tools: [FileReadTool, FileEditTool],
        commands: [],
        mcpClients: [],
        agents: [],
        canUseTool: async (_tool, input) => ({
          behavior: 'allow',
          updatedInput: input,
        }),
        getAppState: () => appState,
        setAppState: fn => {
          appState = fn(appState)
        },
        readFileCache: createFileStateCache(),
        customSystemPrompt: 'Fix bugs.',
      })

      for await (const _ev of engine.submitMessage('Fix apply_target.py')) {
        // consume stream
      }

      expect(readFileSync(filePath, 'utf8')).toBe(
        'def add(a, b):\n    return a + b\n',
      )
    } finally {
      await mock.close()
    }
  })

  // 12. Detect conflicting modifications
  it('12. detects conflicting external file modifications between Read and Edit (stale edit protection)', async () => {
    const filePath = join(tempDir, 'conflict.py')
    writeFileSync(filePath, 'x = 1\n')

    const ctx = createTestToolContext(tempDir)
    await FileReadTool.call(
      { file_path: filePath },
      ctx,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      dummyParentMsg,
    )

    // Simulate external modification after read with newer mtime and changed content
    const futureTime = new Date(Date.now() + 10_000)
    writeFileSync(filePath, 'x = 999\n# externally modified\n')
    utimesSync(filePath, futureTime, futureTime)

    const validation = await FileEditTool.validateInput(
      {
        file_path: filePath,
        old_string: 'x = 1',
        new_string: 'x = 2',
      },
      ctx,
    )

    expect(validation.result).toBe(false)
    if (!validation.result) {
      expect(validation.errorCode).toBe(7)
      expect(validation.message).toContain('File has been modified since read')
    }
  })

  // 13. Run an approved terminal command
  it('13. executes an approved terminal command via BashTool and captures stdout', async () => {
    const scriptPath = join(tempDir, 'hello.py')
    writeFileSync(scriptPath, 'print(21 * 2)\n')

    const ctx = createTestToolContext(tempDir)
    const res = await BashTool.call(
      { command: `python3 "${scriptPath}"` },
      ctx,
      async () => ({ behavior: 'allow', updatedInput: {} }),
      dummyParentMsg,
    )

    expect(res.data.stdout.trim()).toBe('42')
    expect(res.data.interrupted).toBe(false)
  })

  // 14. Handle tool execution failure
  it('14. handles tool execution failure gracefully by returning is_error:true tool_result to DeepSeek', async () => {
    const missingFile = join(tempDir, 'does_not_exist.py')

    const mock = await startScriptedDeepSeekServer([
      // Round 1: try reading a non-existent file
      () => [
        {
          id: 'chatcmpl-fail-1',
          object: 'chat.completion.chunk',
          created: 1700000140,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_read_missing',
                    type: 'function',
                    function: {
                      name: 'Read',
                      arguments: JSON.stringify({ file_path: missingFile }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ],
      // Round 2: model receives error tool result and recovers
      reqBody => {
        const toolMsg = reqBody.messages.find((m: any) => m.role === 'tool')
        expect(toolMsg).toBeDefined()
        expect(toolMsg.tool_call_id).toBe('call_read_missing')
        expect(toolMsg.content).toMatch(/Error|does not exist/i)
        return [
          {
            id: 'chatcmpl-fail-2',
            object: 'chat.completion.chunk',
            created: 1700000141,
            model: DEFAULT_DEEPSEEK_MODEL,
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  content: 'The file does_not_exist.py was not found.',
                },
                finish_reason: 'stop',
              },
            ],
          },
        ]
      },
    ])
    process.env.DEEPSEEK_BASE_URL = mock.baseUrl

    try {
      let appState = getDefaultAppState()
      const engine = new QueryEngine({
        cwd: tempDir,
        tools: [FileReadTool],
        commands: [],
        mcpClients: [],
        agents: [],
        canUseTool: async (_tool, input) => ({
          behavior: 'allow',
          updatedInput: input,
        }),
        getAppState: () => appState,
        setAppState: fn => {
          appState = fn(appState)
        },
        readFileCache: createFileStateCache(),
        customSystemPrompt: 'Handle missing files cleanly.',
      })

      const events: any[] = []
      for await (const ev of engine.submitMessage('Read does_not_exist.py')) {
        events.push(ev)
      }

      expect(mock.requests).toHaveLength(2)
      const resultEvent = events.find(e => e.type === 'result')
      expect(resultEvent.result).toContain('was not found')
    } finally {
      await mock.close()
    }
  })

  // 15. Continue an agent task after tool results
  it('15. continues an agent task across 4 sequential tool-call rounds before producing final response', async () => {
    const filePath = join(tempDir, 'counter.py')
    writeFileSync(filePath, 'COUNT = 0\n')

    const mock = await startScriptedDeepSeekServer([
      // Round 1: Glob
      () => [
        {
          id: 'chatcmpl-r1',
          object: 'chat.completion.chunk',
          created: 1700000150,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_r1_glob',
                    type: 'function',
                    function: {
                      name: 'Glob',
                      arguments: JSON.stringify({ pattern: '*.py', path: tempDir }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ],
      // Round 2: Read
      () => [
        {
          id: 'chatcmpl-r2',
          object: 'chat.completion.chunk',
          created: 1700000151,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_r2_read',
                    type: 'function',
                    function: {
                      name: 'Read',
                      arguments: JSON.stringify({ file_path: filePath }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ],
      // Round 3: Edit
      () => [
        {
          id: 'chatcmpl-r3',
          object: 'chat.completion.chunk',
          created: 1700000152,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_r3_edit',
                    type: 'function',
                    function: {
                      name: 'Edit',
                      arguments: JSON.stringify({
                        file_path: filePath,
                        old_string: 'COUNT = 0',
                        new_string: 'COUNT = 100\nprint(COUNT)',
                      }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ],
      // Round 4: Bash verification
      () => [
        {
          id: 'chatcmpl-r4',
          object: 'chat.completion.chunk',
          created: 1700000153,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_r4_bash',
                    type: 'function',
                    function: {
                      name: 'Bash',
                      arguments: JSON.stringify({
                        command: `python3 "${filePath}"`,
                      }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ],
      // Round 5: Final answer
      reqBody => {
        const lastToolMsg = [...reqBody.messages]
          .reverse()
          .find((m: any) => m.role === 'tool')
        expect(lastToolMsg.content).toContain('100')
        return [
          {
            id: 'chatcmpl-r5',
            object: 'chat.completion.chunk',
            created: 1700000154,
            model: DEFAULT_DEEPSEEK_MODEL,
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  content: 'Updated COUNT to 100 and verified output is 100.',
                },
                finish_reason: 'stop',
              },
            ],
          },
        ]
      },
    ])
    process.env.DEEPSEEK_BASE_URL = mock.baseUrl

    try {
      let appState = getDefaultAppState()
      const engine = new QueryEngine({
        cwd: tempDir,
        tools: [GlobTool, FileReadTool, FileEditTool, BashTool],
        commands: [],
        mcpClients: [],
        agents: [],
        canUseTool: async (_tool, input) => ({
          behavior: 'allow',
          updatedInput: input,
        }),
        getAppState: () => appState,
        setAppState: fn => {
          appState = fn(appState)
        },
        readFileCache: createFileStateCache(),
        customSystemPrompt: 'Complete multi-step coding tasks.',
      })

      const events: any[] = []
      for await (const ev of engine.submitMessage(
        'Find counter.py, update COUNT to 100, and run it.',
      )) {
        events.push(ev)
      }

      expect(mock.requests).toHaveLength(5)
      const resultEvent = events.find(e => e.type === 'result')
      expect(resultEvent.num_turns).toBe(5)
      expect(resultEvent.result).toContain('Updated COUNT to 100')
    } finally {
      await mock.close()
    }
  })
})
