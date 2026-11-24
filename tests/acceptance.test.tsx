/**
 * Phase 14 — Final Acceptance Tests (End-to-End Scenarios 1 & 2)
 *
 * Scenario 1:
 * Create a temporary project containing a buggy Python file:
 * ```python
 * def add(a, b):
 *     return a - b
 *
 * print(add(5, 3))
 * ```
 * Ask the agent to inspect the project and fix the bug.
 * Verify:
 * 1. The agent lists project files (Glob).
 * 2. The agent reads the Python file (Read).
 * 3. The agent identifies the subtraction bug.
 * 4. The agent explains the problem.
 * 5. The agent proposes a fix (Edit).
 * 6. A Diff Preview appears (showing Your code <--> Proposed, - return a - b, + return a + b).
 * 7. Apply and Reject work:
 *    - First test Reject: verify the original file remains `return a - b`.
 *    - Then test Apply: verify the file is updated to `return a + b`.
 * 8. The updated program runs (`python3 main.py`) and outputs `8`.
 * 9. Normal requests never contact any Anthropic endpoint.
 *
 * Scenario 2:
 * Test a multi-file task requiring multiple tool calls (Glob, Grep, Read multiple files,
 * Edit multiple files, Write new test runner file, Bash execution).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StructuredDiffFallback } from '../src/components/StructuredDiff/Fallback.js'
import { getFilePermissionOptions } from '../src/components/permissions/FilePermissionDialog/permissionOptions.js'
import { FileWriteToolDiff } from '../src/components/permissions/FileWritePermissionRequest/FileWriteToolDiff.js'
import { QueryEngine } from '../src/QueryEngine.js'
import type { DeepSeekChatChunk } from '../src/services/api/deepseekClient.js'
import { getDefaultAppState } from '../src/state/AppStateStore.js'
import { getEmptyToolPermissionContext } from '../src/Tool.js'
import { BashTool } from '../src/tools/BashTool/BashTool.js'
import { FileEditTool } from '../src/tools/FileEditTool/FileEditTool.js'
import { FileReadTool } from '../src/tools/FileReadTool/FileReadTool.js'
import { FileWriteTool } from '../src/tools/FileWriteTool/FileWriteTool.js'
import { GlobTool } from '../src/tools/GlobTool/GlobTool.js'
import { GrepTool } from '../src/tools/GrepTool/GrepTool.js'
import { getPatchForDisplay } from '../src/utils/diff.js'
import { createFileStateCacheWithSizeLimit } from '../src/utils/fileStateCache.js'
import { DEFAULT_DEEPSEEK_MODEL } from '../src/utils/model/providers.js'
import { setCwd } from '../src/utils/Shell.js'
import { AppStateProvider } from '../src/state/AppState.js'
import { renderToString as rawRenderToString } from '../src/utils/staticRender.js'

function renderToString(node: React.ReactNode, columns?: number): Promise<string> {
  return rawRenderToString(<AppStateProvider>{node}</AppStateProvider>, columns)
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

async function startAcceptanceDeepSeekServer(
  turns: Array<(reqBody: any) => DeepSeekChatChunk[]>,
): Promise<{
  baseUrl: string
  requests: Array<{ url?: string; headers: IncomingMessage['headers']; body: any }>
  close: () => Promise<void>
}> {
  const requests: Array<{
    url?: string
    headers: IncomingMessage['headers']
    body: any
  }> = []
  let turnIdx = 0

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(Buffer.from(c)))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      let body: any = {}
      try {
        body = JSON.parse(raw)
      } catch {
        // ignore
      }
      requests.push({
        url: req.url,
        headers: req.headers,
        body,
      })
      const handler = turns[Math.min(turnIdx, turns.length - 1)]!
      turnIdx++
      writeSSEChunks(res, [...handler(body), '[DONE]'])
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

describe('Phase 14 — End-to-End Acceptance Tests', () => {
  let tempDir: string
  const origEnv = { ...process.env }
  const origCwd = process.cwd()

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'claude-deepseek-acceptance-'))
    setCwd(tempDir)
    process.env.DEEPSEEK_API_KEY = 'sk-deepseek-e2e-acceptance-key'
    process.env.DEEPSEEK_MODEL = DEFAULT_DEEPSEEK_MODEL
    process.env.CLAUDE_CODE_SIMPLE = '1'
  })

  afterEach(() => {
    setCwd(origCwd)
    process.env = { ...origEnv }
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('Scenario 1: inspects buggy Python project, explains subtraction bug, shows Diff Preview, supports Reject then Apply, and fixed program outputs 8', async () => {
    const mainPy = join(tempDir, 'main.py')
    const buggyCode = [
      'def add(a, b):',
      '    return a - b',
      '',
      'print(add(5, 3))',
      '',
    ].join('\n')
    writeFileSync(mainPy, buggyCode)

    // Verify initial buggy output is 2
    const initialRun = execFileSync('python3', [mainPy], { encoding: 'utf8' })
    expect(initialRun.trim()).toBe('2')

    const buildTurns = () => [
      // Turn 1: Agent lists project files via Glob
      () => [
        {
          id: 'chatcmpl-acc-1',
          object: 'chat.completion.chunk',
          created: 1700001001,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                content: 'I will list the files in the project first.',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_glob_1',
                    type: 'function',
                    function: {
                      name: 'Glob',
                      arguments: JSON.stringify({
                        pattern: '**/*.py',
                        path: tempDir,
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
      // Turn 2: Agent reads main.py
      (reqBody: any) => {
        const globResultMsg = reqBody.messages.find(
          (m: any) => m.role === 'tool' && m.tool_call_id === 'call_glob_1',
        )
        expect(globResultMsg).toBeDefined()
        expect(globResultMsg.content).toContain('main.py')
        return [
          {
            id: 'chatcmpl-acc-2',
            object: 'chat.completion.chunk',
            created: 1700001002,
            model: DEFAULT_DEEPSEEK_MODEL,
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  content: 'Now I will read main.py to inspect the code.',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_read_2',
                      type: 'function',
                      function: {
                        name: 'Read',
                        arguments: JSON.stringify({ file_path: mainPy }),
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          },
        ]
      },
      // Turn 3: Agent identifies the subtraction bug, explains the problem, and proposes a fix
      (reqBody: any) => {
        const readResultMsg = reqBody.messages.find(
          (m: any) => m.role === 'tool' && m.tool_call_id === 'call_read_2',
        )
        expect(readResultMsg).toBeDefined()
        expect(readResultMsg.content).toContain('return a - b')
        return [
          {
            id: 'chatcmpl-acc-3',
            object: 'chat.completion.chunk',
            created: 1700001003,
            model: DEFAULT_DEEPSEEK_MODEL,
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  content:
                    'I found the bug in `main.py`: the `add(a, b)` function performs subtraction (`return a - b`) instead of addition (`return a + b`). I will propose an edit to fix it.',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_edit_3',
                      type: 'function',
                      function: {
                        name: 'Edit',
                        arguments: JSON.stringify({
                          file_path: mainPy,
                          old_string: '    return a - b',
                          new_string: '    return a + b',
                        }),
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          },
        ]
      },
      // Turn 4: Final response after Reject or Apply
      (reqBody: any) => {
        const editResultMsg = reqBody.messages.find(
          (m: any) => m.role === 'tool' && m.tool_call_id === 'call_edit_3',
        )
        expect(editResultMsg).toBeDefined()
        const wasRejected = editResultMsg.content.includes('Error:')
        return [
          {
            id: 'chatcmpl-acc-4',
            object: 'chat.completion.chunk',
            created: 1700001004,
            model: DEFAULT_DEEPSEEK_MODEL,
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  content: wasRejected
                    ? 'The proposed edit to main.py was rejected, so the file remains unchanged.'
                    : 'The fix has been applied to main.py: `add(a, b)` now returns `a + b`.',
                },
                finish_reason: 'stop',
              },
            ],
          },
        ]
      },
    ]

    // --- PART A: Test REJECT workflow ---
    const rejectServer = await startAcceptanceDeepSeekServer(buildTurns())
    process.env.DEEPSEEK_BASE_URL = rejectServer.baseUrl
    let diffPreviewTextOnReject = ''

    try {
      let appState = getDefaultAppState()
      const rejectEngine = new QueryEngine({
        cwd: tempDir,
        tools: [GlobTool, FileReadTool, FileEditTool, BashTool],
        commands: [],
        mcpClients: [],
        agents: [],
        canUseTool: async (tool, input: any) => {
          if (tool.name === FileEditTool.name) {
            // Render the Diff Preview before user decision
            const hunks = getPatchForDisplay({
              filePath: input.file_path,
              fileContents: readFileSync(input.file_path, 'utf8'),
              edits: [
                {
                  old_string: input.old_string,
                  new_string: input.new_string,
                  replace_all: false,
                },
              ],
            })
            diffPreviewTextOnReject = await renderToString(
              <StructuredDiffFallback
                patch={hunks[0]!}
                dim={false}
                width={80}
              />,
              80,
            )
            // Select Reject (No)
            const opts = getFilePermissionOptions({
              filePath: input.file_path,
              toolPermissionContext: getEmptyToolPermissionContext(),
              operationType: 'write',
            })
            const rejectOption = opts.find(o => o.value === 'no')!
            expect(rejectOption.label).toBe('Reject (No)')
            return {
              behavior: 'deny',
              message: 'User selected Reject (No) in Diff Preview',
              reason: { type: 'user_rejected' } as any,
            }
          }
          return { behavior: 'allow', updatedInput: input }
        },
        getAppState: () => appState,
        setAppState: fn => {
          appState = fn(appState)
        },
        readFileCache: createFileStateCacheWithSizeLimit(100),
        customSystemPrompt: 'Inspect the project and fix bugs.',
      })

      const rejectEvents: any[] = []
      for await (const ev of rejectEngine.submitMessage(
        'Inspect the project and fix the bug in main.py',
      )) {
        rejectEvents.push(ev)
      }

      // Verify Diff Preview rendered removed and added lines before user decision
      expect(diffPreviewTextOnReject).toContain('-    return a - b')
      expect(diffPreviewTextOnReject).toContain('+    return a + b')

      // Verify file on disk is still unchanged after Reject
      expect(readFileSync(mainPy, 'utf8')).toBe(buggyCode)
    } finally {
      await rejectServer.close()
    }

    // --- PART B: Test APPLY workflow ---
    const applyServer = await startAcceptanceDeepSeekServer(buildTurns())
    process.env.DEEPSEEK_BASE_URL = applyServer.baseUrl
    let diffPreviewTextOnApply = ''

    try {
      let appState = getDefaultAppState()
      const applyEngine = new QueryEngine({
        cwd: tempDir,
        tools: [GlobTool, FileReadTool, FileEditTool, BashTool],
        commands: [],
        mcpClients: [],
        agents: [],
        canUseTool: async (tool, input: any) => {
          if (tool.name === FileEditTool.name) {
            const currentContent = readFileSync(input.file_path, 'utf8')
            const updatedContent = currentContent.replace(
              input.old_string,
              input.new_string,
            )
            diffPreviewTextOnApply = await renderToString(
              <FileWriteToolDiff
                file_path={input.file_path}
                fileExists={true}
                oldContent={currentContent}
                content={updatedContent}
              />,
              80,
            )
            const opts = getFilePermissionOptions({
              filePath: input.file_path,
              toolPermissionContext: getEmptyToolPermissionContext(),
              operationType: 'write',
            })
            const applyOption = opts.find(o => o.value === 'yes')!
            expect(applyOption.label).toBe('Apply (Yes)')
            return { behavior: 'allow', updatedInput: input }
          }
          return { behavior: 'allow', updatedInput: input }
        },
        getAppState: () => appState,
        setAppState: fn => {
          appState = fn(appState)
        },
        readFileCache: createFileStateCacheWithSizeLimit(100),
        customSystemPrompt: 'Inspect the project and fix bugs.',
      })

      const applyEvents: any[] = []
      for await (const ev of applyEngine.submitMessage(
        'Inspect the project and fix the bug in main.py',
      )) {
        applyEvents.push(ev)
      }

      // Verify Diff Preview header and diff lines
      expect(diffPreviewTextOnApply).toContain('Your code <--> Proposed')
      expect(diffPreviewTextOnApply).toContain('return a - b')
      expect(diffPreviewTextOnApply).toContain('return a + b')

      // Verify explanation and final result
      const resultEvent = applyEvents.find(e => e.type === 'result')
      expect(resultEvent).toBeDefined()
      expect(resultEvent.result).toContain('`add(a, b)` now returns `a + b`')

      // Verify file on disk was updated
      const updatedCode = readFileSync(mainPy, 'utf8')
      expect(updatedCode).toContain('return a + b')
      expect(updatedCode).not.toContain('return a - b')

      // Run the updated Python file and verify it prints 8
      const fixedOutput = execFileSync('python3', [mainPy], {
        encoding: 'utf8',
      })
      expect(fixedOutput.trim()).toBe('8')

      // Verify every request used DeepSeek endpoint and Bearer key
      expect(applyServer.requests.length).toBeGreaterThanOrEqual(4)
      for (const req of applyServer.requests) {
        expect(req.url).toBe('/chat/completions')
        expect(req.headers.authorization).toBe(
          'Bearer sk-deepseek-e2e-acceptance-key',
        )
      }
    } finally {
      await applyServer.close()
    }
  })

  it('Scenario 2: completes a multi-file coding task using Grep, multi-file Read, multi-file Edit, FileWrite, and Bash verification', async () => {
    const opsPy = join(tempDir, 'operations.py')
    const cliPy = join(tempDir, 'cli.py')
    const verifyPy = join(tempDir, 'verify_all.py')

    writeFileSync(
      opsPy,
      'def add(a, b):\n    return a - b\n\ndef multiply(a, b):\n    return a + b\n',
    )
    writeFileSync(
      cliPy,
      'from operations import add, multiply\n\ndef compute():\n    return add(5, 3), multiply(4, 3)\n',
    )

    const server = await startAcceptanceDeepSeekServer([
      // Round 1: Grep + Read both files in parallel
      () => [
        {
          id: 'chatcmpl-mf-1',
          object: 'chat.completion.chunk',
          created: 1700002001,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                content: 'Searching and reading both files...',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_grep_mf',
                    type: 'function',
                    function: {
                      name: 'Grep',
                      arguments: JSON.stringify({
                        pattern: 'def ',
                        path: tempDir,
                        output_mode: 'content',
                      }),
                    },
                  },
                  {
                    index: 1,
                    id: 'call_read_ops',
                    type: 'function',
                    function: {
                      name: 'Read',
                      arguments: JSON.stringify({ file_path: opsPy }),
                    },
                  },
                  {
                    index: 2,
                    id: 'call_read_cli',
                    type: 'function',
                    function: {
                      name: 'Read',
                      arguments: JSON.stringify({ file_path: cliPy }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ],
      // Round 2: Edit both files + Write verify_all.py
      () => [
        {
          id: 'chatcmpl-mf-2',
          object: 'chat.completion.chunk',
          created: 1700002002,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                content:
                  'Fixing operations.py, updating cli.py, and creating verify_all.py...',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_edit_ops',
                    type: 'function',
                    function: {
                      name: 'Edit',
                      arguments: JSON.stringify({
                        file_path: opsPy,
                        old_string:
                          'def add(a, b):\n    return a - b\n\ndef multiply(a, b):\n    return a + b',
                        new_string:
                          'def add(a, b):\n    return a + b\n\ndef multiply(a, b):\n    return a * b',
                      }),
                    },
                  },
                  {
                    index: 1,
                    id: 'call_edit_cli',
                    type: 'function',
                    function: {
                      name: 'Edit',
                      arguments: JSON.stringify({
                        file_path: cliPy,
                        old_string: '    return add(5, 3), multiply(4, 3)',
                        new_string:
                          '    return {"sum": add(5, 3), "product": multiply(4, 3)}',
                      }),
                    },
                  },
                  {
                    index: 2,
                    id: 'call_write_verify',
                    type: 'function',
                    function: {
                      name: 'Write',
                      arguments: JSON.stringify({
                        file_path: verifyPy,
                        content:
                          'from cli import compute\nres = compute()\nassert res == {"sum": 8, "product": 12}, f"Unexpected: {res}"\nprint(f"VERIFIED:{res[\'sum\']}:{res[\'product\']}")\n',
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
      // Round 3: Run verify_all.py via BashTool
      () => [
        {
          id: 'chatcmpl-mf-3',
          object: 'chat.completion.chunk',
          created: 1700002003,
          model: DEFAULT_DEEPSEEK_MODEL,
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                content: 'Running verification script...',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_bash_verify',
                    type: 'function',
                    function: {
                      name: 'Bash',
                      arguments: JSON.stringify({
                        command: `python3 "${verifyPy}"`,
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
      // Round 4: Final summary
      (reqBody: any) => {
        const bashToolMsg = reqBody.messages.find(
          (m: any) => m.role === 'tool' && m.tool_call_id === 'call_bash_verify',
        )
        expect(bashToolMsg).toBeDefined()
        expect(bashToolMsg.content).toContain('VERIFIED:8:12')
        return [
          {
            id: 'chatcmpl-mf-4',
            object: 'chat.completion.chunk',
            created: 1700002004,
            model: DEFAULT_DEEPSEEK_MODEL,
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  content:
                    'All multi-file edits and verification passed (`VERIFIED:8:12`).',
                },
                finish_reason: 'stop',
              },
            ],
          },
        ]
      },
    ])

    process.env.DEEPSEEK_BASE_URL = server.baseUrl

    try {
      let appState = getDefaultAppState()
      const approvedFiles: string[] = []
      const engine = new QueryEngine({
        cwd: tempDir,
        tools: [
          GlobTool,
          GrepTool,
          FileReadTool,
          FileEditTool,
          FileWriteTool,
          BashTool,
        ],
        commands: [],
        mcpClients: [],
        agents: [],
        canUseTool: async (tool, input: any) => {
          if (
            tool.name === FileEditTool.name ||
            tool.name === FileWriteTool.name
          ) {
            approvedFiles.push(input.file_path)
          }
          return { behavior: 'allow', updatedInput: input }
        },
        getAppState: () => appState,
        setAppState: fn => {
          appState = fn(appState)
        },
        readFileCache: createFileStateCacheWithSizeLimit(100),
        customSystemPrompt: 'Fix multi-file Python projects and verify.',
      })

      const events: any[] = []
      for await (const ev of engine.submitMessage(
        'Fix operations.py and cli.py, write verify_all.py, and run it.',
      )) {
        events.push(ev)
      }

      expect(approvedFiles).toEqual([opsPy, cliPy, verifyPy])
      expect(existsSync(verifyPy)).toBe(true)
      expect(readFileSync(opsPy, 'utf8')).toContain('return a * b')
      expect(readFileSync(cliPy, 'utf8')).toContain('"product": multiply(4, 3)')

      const resultEvent = events.find(e => e.type === 'result')
      expect(resultEvent.result).toContain('VERIFIED:8:12')
    } finally {
      await server.close()
    }
  })
})
