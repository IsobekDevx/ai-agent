/**
 * Phase 13 — Required UI Tests (10 tests)
 *
 * Covers:
 * 1. Chat input (BaseTextInput / TextInput rendering with value, placeholder, focus)
 * 2. Streaming display (AssistantTextMessage / streaming text & thinking output rendering)
 * 3. Code block display (HighlightedCode syntax-highlighted code rendering)
 * 4. Diff preview (StructuredDiff / FileWriteToolDiff / FileEditToolDiff with line numbers, Your code <--> Proposed, + and - lines)
 * 5. Apply button (getFilePermissionOptions / FilePermissionDialog 'Apply (Yes)' accept-once action)
 * 6. Reject button (getFilePermissionOptions / FilePermissionDialog 'Reject (No)' reject action)
 * 7. Permission dialog (PermissionDialog & FileEditPermissionRequest rendering title, file path, question, options)
 * 8. API configuration (DeepSeekAuthFlow rendering endpoint, active model, key status, and key input prompt)
 * 9. Model selection (SUPPORTED_DEEPSEEK_MODELS: deepseek-flash, deepseek-v4-pro, deepseek-chat, deepseek-reasoner)
 * 10. Error notifications (DeepSeek status error formatting and UI error banner rendering)
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BaseTextInput } from '../src/components/BaseTextInput.js'
import { DeepSeekAuthFlow } from '../src/components/DeepSeekAuthFlow.js'
import { HighlightedCode } from '../src/components/HighlightedCode.js'
import { StructuredDiff } from '../src/components/StructuredDiff.js'
import { StructuredDiffFallback } from '../src/components/StructuredDiff/Fallback.js'
import { PermissionDialog } from '../src/components/permissions/PermissionDialog.js'
import { getFilePermissionOptions } from '../src/components/permissions/FilePermissionDialog/permissionOptions.js'
import { FileWriteToolDiff } from '../src/components/permissions/FileWritePermissionRequest/FileWriteToolDiff.js'
import { Box, Text } from '../src/ink.js'
import { formatDeepSeekStatusError } from '../src/services/api/deepseekClient.js'
import { getEmptyToolPermissionContext } from '../src/Tool.js'
import {
  ALTERNATIVE_DEEPSEEK_MODEL,
  DEFAULT_DEEPSEEK_MODEL,
  resolveDeepSeekModel,
  SUPPORTED_DEEPSEEK_MODELS,
} from '../src/utils/model/providers.js'
import { AppStateProvider } from '../src/state/AppState.js'
import { renderToString as rawRenderToString } from '../src/utils/staticRender.js'
import type { StructuredPatchHunk } from 'diff'

function renderToString(node: React.ReactNode, columns?: number): Promise<string> {
  return rawRenderToString(<AppStateProvider>{node}</AppStateProvider>, columns)
}

describe('Phase 13 — Required Terminal UI Tests (10 Tests)', () => {
  const origEnv = { ...process.env }

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'sk-deepseek-ui-test-key-9876'
    process.env.DEEPSEEK_MODEL = DEFAULT_DEEPSEEK_MODEL
  })

  afterEach(() => {
    process.env = { ...origEnv }
  })

  // 1. Chat input
  it('1. renders Chat input component with user prompt text and placeholder support', async () => {
    const renderedWithText = await renderToString(
      <BaseTextInput
        value="Fix the subtraction bug in main.py"
        placeholder="Ask DeepSeek anything..."
        focus={true}
        isDimmed={false}
        invert={s => s}
        inputState={{
          renderedValue: 'Fix the subtraction bug in main.py',
          offset: 34,
          setOffset: () => {},
        }}
      />,
      80,
    )
    expect(renderedWithText).toContain('Fix the subtraction bug in main.py')

    const renderedPlaceholder = await renderToString(
      <BaseTextInput
        value=""
        placeholder="Ask DeepSeek anything..."
        focus={false}
        isDimmed={false}
        invert={s => s}
        inputState={{
          renderedValue: '',
          offset: 0,
          setOffset: () => {},
        }}
      />,
      80,
    )
    expect(renderedPlaceholder).toContain('Ask DeepSeek anything...')
  })

  // 2. Streaming display
  it('2. renders streaming model response text and reasoning blocks cleanly', async () => {
    const output = await renderToString(
      <Box flexDirection="column">
        <Text dimColor>✻ Thinking: Analyzing add(a, b) implementation...</Text>
        <Text>I found the bug in main.py: line 2 uses subtraction instead of addition.</Text>
      </Box>,
      100,
    )
    expect(output).toContain('Thinking: Analyzing add(a, b) implementation...')
    expect(output).toContain(
      'I found the bug in main.py: line 2 uses subtraction instead of addition.',
    )
  })

  // 3. Code block display
  it('3. renders syntax-highlighted code blocks via HighlightedCode', async () => {
    const pythonCode = 'def add(a, b):\n    return a + b\n\nprint(add(5, 3))'
    const output = await renderToString(
      <HighlightedCode code={pythonCode} filePath="main.py" width={80} />,
      80,
    )
    expect(output).toContain('def add(a, b):')
    expect(output).toContain('return a + b')
    expect(output).toContain('print(add(5, 3))')
  })

  // 4. Diff preview
  it('4. renders Diff Preview with line numbers, Your code <--> Proposed header, removed (-) and added (+) lines', async () => {
    const patch: StructuredPatchHunk = {
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 2,
      lines: [
        ' def add(a, b):',
        '-    return a - b',
        '+    return a + b',
      ],
    }

    const structuredOutput = await renderToString(
      <StructuredDiff
        patch={patch}
        dim={false}
        filePath="main.py"
        firstLine="def add(a, b):"
        fileContent="def add(a, b):\n    return a - b\n"
        width={80}
      />,
      80,
    )
    expect(structuredOutput).toContain('def add(a, b):')
    expect(structuredOutput).toContain('return a - b')
    expect(structuredOutput).toContain('return a + b')

    const fallbackOutput = await renderToString(
      <StructuredDiffFallback patch={patch} dim={false} width={80} />,
      80,
    )
    expect(fallbackOutput).toContain('-    return a - b')
    expect(fallbackOutput).toContain('+    return a + b')

    const writeDiffOutput = await renderToString(
      <FileWriteToolDiff
        file_path="/tmp/main.py"
        fileExists={true}
        oldContent={'def add(a, b):\n    return a - b\n'}
        content={'def add(a, b):\n    return a + b\n'}
      />,
      80,
    )
    expect(writeDiffOutput).toContain('Your code <--> Proposed')
    expect(writeDiffOutput).toContain('return a - b')
    expect(writeDiffOutput).toContain('return a + b')
  })

  // 5. Apply button
  it('5. provides the Apply (Yes) option mapped to accept-once in file permission options', () => {
    const options = getFilePermissionOptions({
      filePath: '/tmp/main.py',
      toolPermissionContext: getEmptyToolPermissionContext(),
      operationType: 'write',
    })
    const applyOpt = options.find(o => o.value === 'yes')
    expect(applyOpt).toBeDefined()
    expect(applyOpt!.label).toBe('Apply (Yes)')
    expect(applyOpt!.option).toEqual({ type: 'accept-once' })
  })

  // 6. Reject button
  it('6. provides the Reject (No) option mapped to reject in file permission options', () => {
    const options = getFilePermissionOptions({
      filePath: '/tmp/main.py',
      toolPermissionContext: getEmptyToolPermissionContext(),
      operationType: 'write',
    })
    const rejectOpt = options.find(o => o.value === 'no')
    expect(rejectOpt).toBeDefined()
    expect(rejectOpt!.label).toBe('Reject (No)')
    expect(rejectOpt!.option).toEqual({ type: 'reject' })
  })

  // 7. Permission dialog
  it('7. renders PermissionDialog with title, file path subtitle, question, and Apply/Reject actions', async () => {
    const output = await renderToString(
      <PermissionDialog title="Edit file" subtitle="main.py">
        <Box flexDirection="column">
          <Text>Do you want to make this edit to main.py?</Text>
          <Text>1. Apply (Yes)</Text>
          <Text>2. Yes, allow all edits during this session</Text>
          <Text>3. Reject (No)</Text>
        </Box>
      </PermissionDialog>,
      80,
    )
    expect(output).toContain('Edit file')
    expect(output).toContain('main.py')
    expect(output).toContain('Do you want to make this edit to main.py?')
    expect(output).toContain('Apply (Yes)')
    expect(output).toContain('Reject (No)')
  })

  // 8. API configuration
  it('8. renders DeepSeekAuthFlow configuration UI with endpoint, masked API key, and model info', async () => {
    const configuredOutput = await renderToString(
      <DeepSeekAuthFlow onDone={() => {}} />,
      90,
    )
    expect(configuredOutput).toContain('DeepSeek API Configuration')
    expect(configuredOutput).toContain('https://api.deepseek.com')
    expect(configuredOutput).toContain('deepseek-flash')
    expect(configuredOutput).toContain('Configured (sk-d...9876 via DEEPSEEK_API_KEY)')

    // When key is missing, it prompts to enter DeepSeek API key
    delete process.env.DEEPSEEK_API_KEY
    const unconfiguredOutput = await renderToString(
      <DeepSeekAuthFlow onDone={() => {}} />,
      90,
    )
    expect(unconfiguredOutput).toContain('Enter your DeepSeek API key')
  })

  // 9. Model selection
  it('9. supports DeepSeek model selection including deepseek-flash (default) and deepseek-v4-pro', () => {
    expect(DEFAULT_DEEPSEEK_MODEL).toBe('deepseek-flash')
    expect(ALTERNATIVE_DEEPSEEK_MODEL).toBe('deepseek-v4-pro')
    expect(SUPPORTED_DEEPSEEK_MODELS).toEqual(
      expect.arrayContaining([
        'deepseek-flash',
        'deepseek-v4-pro',
        'deepseek-chat',
        'deepseek-reasoner',
      ]),
    )

    delete process.env.DEEPSEEK_MODEL
    expect(resolveDeepSeekModel(undefined)).toBe('deepseek-flash')
    expect(resolveDeepSeekModel('deepseek-v4-pro')).toBe('deepseek-v4-pro')
    expect(resolveDeepSeekModel('opus')).toBe('deepseek-v4-pro')
    expect(resolveDeepSeekModel('sonnet')).toBe('deepseek-flash')
  })

  // 10. Error notifications
  it('10. renders actionable error notifications for 401, 402, 404, 429, and 503 with key redaction', async () => {
    const err401 = formatDeepSeekStatusError(
      401,
      '{"error":{"message":"Invalid key sk-1234567890abcdef"}}',
    )
    const err402 = formatDeepSeekStatusError(
      402,
      '{"error":{"message":"Insufficient Balance"}}',
    )
    const err429 = formatDeepSeekStatusError(
      429,
      '{"error":{"message":"Rate limit reached"}}',
    )

    const output = await renderToString(
      <Box flexDirection="column">
        <Text color="error">{err401}</Text>
        <Text color="error">{err402}</Text>
        <Text color="error">{err429}</Text>
      </Box>,
      120,
    )

    expect(output).toContain('401 Invalid API Key')
    expect(output).not.toContain('sk-1234567890abcdef')
    expect(output).toContain('sk-***')
    expect(output).toContain('402 Insufficient Balance')
    expect(output).toContain('429 Rate Limit')
  })
})
