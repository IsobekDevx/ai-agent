import React, { useCallback, useState } from 'react'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { Box, Text } from '../ink.js'
import { verifyDeepSeekApiKey } from '../services/api/deepseekClient.js'
import {
  clearStoredDeepSeekApiKey,
  getDeepSeekApiKeyWithSource,
  getDeepSeekBaseUrl,
  resolveDeepSeekModel,
  saveStoredDeepSeekApiKey,
  SUPPORTED_DEEPSEEK_MODELS,
} from '../utils/model/providers.js'
import { updateSettingsForSource } from '../utils/settings/settings.js'
import { Select } from './CustomSelect/select.js'
import { Spinner } from './Spinner.js'
import TextInput from './TextInput.js'

type Props = {
  onDone(success?: boolean): void
  startingMessage?: string
}

type Step =
  | { type: 'menu' }
  | { type: 'enter_key' }
  | { type: 'verifying'; apiKey: string }
  | { type: 'select_model' }
  | { type: 'status'; message: string; isError?: boolean }

export function DeepSeekAuthFlow({ onDone, startingMessage }: Props): React.ReactNode {
  const { key: currentKey, source: currentSource } = getDeepSeekApiKeyWithSource()
  const currentModel = resolveDeepSeekModel()
  const baseUrl = getDeepSeekBaseUrl()
  const { columns } = useTerminalSize()

  const [step, setStep] = useState<Step>(() =>
    currentKey ? { type: 'menu' } : { type: 'enter_key' },
  )
  const [inputKey, setInputKey] = useState('')
  const [cursorOffset, setCursorOffset] = useState(0)
  const [statusNote, setStatusNote] = useState<string | null>(startingMessage ?? null)
  const [isErrorNote, setIsErrorNote] = useState(false)

  const maskKey = (k: string | null): string => {
    if (!k) return 'Not configured'
    if (k.length <= 8) return '********'
    return `${k.slice(0, 4)}...${k.slice(-4)}`
  }

  const verifyAndSaveKey = useCallback(
    async (candidateKey: string, finishAfter = false) => {
      const trimmed = candidateKey.trim()
      if (!trimmed) {
        setStatusNote('API key cannot be empty.')
        setIsErrorNote(true)
        setStep({ type: 'enter_key' })
        return
      }
      setStep({ type: 'verifying', apiKey: trimmed })
      setStatusNote(null)
      setIsErrorNote(false)

      try {
        const ok = await verifyDeepSeekApiKey({ apiKey: trimmed })
        if (!ok) {
          setStatusNote('Invalid DeepSeek API key (401 Unauthorized). Please check your key and try again.')
          setIsErrorNote(true)
          setStep({ type: 'enter_key' })
          return
        }
        if (!saveStoredDeepSeekApiKey(trimmed)) {
          setStatusNote('DeepSeek API key verified, but local credential storage could not be updated.')
          setIsErrorNote(true)
          setStep({ type: 'menu' })
          return
        }
        setStatusNote('DeepSeek API key verified and saved to local credential storage.')
        setIsErrorNote(false)
        if (finishAfter) {
          onDone(true)
        } else {
          setStep({ type: 'menu' })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setStatusNote(`DeepSeek key verification failed: ${msg}`)
        setIsErrorNote(true)
        setStep({ type: 'enter_key' })
      }
    },
    [onDone],
  )

  const testCurrentConnectivity = useCallback(async () => {
    const { key } = getDeepSeekApiKeyWithSource()
    if (!key) {
      setStatusNote('No DeepSeek API key is configured. Please enter an API key first.')
      setIsErrorNote(true)
      setStep({ type: 'enter_key' })
      return
    }
    setStep({ type: 'verifying', apiKey: key })
    try {
      const ok = await verifyDeepSeekApiKey({ apiKey: key })
      if (ok) {
        setStatusNote(`Connected to ${baseUrl} (model: ${currentModel})`)
        setIsErrorNote(false)
      } else {
        setStatusNote('Authentication failed (401 Invalid API key).')
        setIsErrorNote(true)
      }
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : String(err))
      setIsErrorNote(true)
    }
    setStep({ type: 'menu' })
  }, [baseUrl, currentModel])

  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      <Box flexDirection="column">
        <Text bold>DeepSeek API Configuration</Text>
        <Text dimColor>
          Endpoint: {baseUrl} · Active Model: {currentModel}
        </Text>
        <Text dimColor>
          API Key Status: {currentKey ? `Configured (${maskKey(currentKey)} via ${currentSource})` : 'Missing (Set DEEPSEEK_API_KEY or enter below)'}
        </Text>
        {process.platform === 'linux' && currentSource === '/login managed key' && (
          <Text dimColor>Linux credential storage is plaintext with owner-only file permissions.</Text>
        )}
      </Box>

      {statusNote && (
        <Box>
          <Text color={isErrorNote ? 'error' : 'success'}>{statusNote}</Text>
        </Box>
      )}

      {step.type === 'verifying' && (
        <Box>
          <Spinner />
          <Text> Testing DeepSeek API connectivity...</Text>
        </Box>
      )}

      {step.type === 'enter_key' && (
        <Box flexDirection="column" gap={1}>
          <Text>Enter your DeepSeek API key (from platform.deepseek.com):</Text>
          <Box>
            <Text bold>{'> '}</Text>
            <TextInput
              value={inputKey}
              onChange={setInputKey}
              onSubmit={(val: string) => void verifyAndSaveKey(val, false)}
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
              columns={Math.max(20, columns - 4)}
              focus={true}
              mask="*"
              placeholder="sk-..."
            />
          </Box>
          <Text dimColor>Press Enter to save & verify · Esc to return</Text>
        </Box>
      )}

      {step.type === 'select_model' && (
        <Box flexDirection="column" gap={1}>
          <Text>Select DeepSeek Model:</Text>
          <Select
            options={SUPPORTED_DEEPSEEK_MODELS.map(m => ({
              label: m === currentModel ? `${m} (active)` : m,
              value: m,
            }))}
            onChange={(selectedModel: string) => {
              process.env.DEEPSEEK_MODEL = selectedModel
              updateSettingsForSource('userSettings', { model: selectedModel })
              setStatusNote(`Selected DeepSeek model: ${selectedModel}`)
              setIsErrorNote(false)
              setStep({ type: 'menu' })
            }}
            onCancel={() => setStep({ type: 'menu' })}
          />
        </Box>
      )}

      {step.type === 'menu' && (
        <Box flexDirection="column">
          <Select
            options={[
              {
                label: currentKey ? 'Update DeepSeek API key' : 'Enter DeepSeek API key',
                value: 'enter_key',
              },
              {
                label: 'Test DeepSeek API connectivity',
                value: 'test',
              },
              {
                label: `Select model (current: ${currentModel})`,
                value: 'model',
              },
              ...(currentKey && currentSource === '/login managed key'
                ? [
                    {
                      label: 'Remove saved API key from local credential storage',
                      value: 'clear_key',
                    },
                  ]
                : []),
              {
                label: 'Done',
                value: 'done',
              },
            ]}
            onChange={(choice: string) => {
              if (choice === 'enter_key') {
                setInputKey('')
                setCursorOffset(0)
                setStep({ type: 'enter_key' })
              } else if (choice === 'test') {
                void testCurrentConnectivity()
              } else if (choice === 'model') {
                setStep({ type: 'select_model' })
              } else if (choice === 'clear_key') {
                clearStoredDeepSeekApiKey()
                setStatusNote('Removed saved DeepSeek API key from local credential storage.')
                setIsErrorNote(false)
                setStep({ type: 'menu' })
              } else if (choice === 'done') {
                onDone(true)
              }
            }}
            onCancel={() => onDone(false)}
          />
        </Box>
      )}
    </Box>
  )
}
