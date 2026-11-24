import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'
import { isBareMode, isEnvTruthy } from '../envUtils.js'
import { getSecureStorage } from '../secureStorage/index.js'

export type APIProvider =
  | 'firstParty'
  | 'bedrock'
  | 'vertex'
  | 'foundry'
  | 'deepseek'

export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash'
export const ALTERNATIVE_DEEPSEEK_MODEL = 'deepseek-v4-pro'
export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

export const SUPPORTED_DEEPSEEK_MODELS = [
  'deepseek-flash',
  'deepseek-v4-pro',
  'deepseek-chat',
  'deepseek-reasoner',
] as const

const DEEPSEEK_MODEL_ALIASES: Record<string, string> = {
  best: 'deepseek-v4-pro',
  opus: 'deepseek-v4-pro',
  opusplan: 'deepseek-v4-pro',
  sonnet: 'deepseek-flash',
  haiku: 'deepseek-flash',
}

export function getStoredDeepSeekApiKey(): string | null {
  if (isBareMode()) return null
  try {
    const data = getSecureStorage().read()
    if (data && typeof data.deepseekApiKey === 'string' && data.deepseekApiKey.trim()) {
      return data.deepseekApiKey.trim()
    }
  } catch {
    // ignore storage read errors
  }
  return null
}

export function saveStoredDeepSeekApiKey(apiKey: string): boolean {
  if (isBareMode()) return false
  try {
    const storage = getSecureStorage()
    const existing = storage.read() ?? {}
    return storage.update({
      ...existing,
      deepseekApiKey: apiKey.trim(),
    }).success
  } catch {
    return false
  }
}

export function clearStoredDeepSeekApiKey(): boolean {
  if (isBareMode()) return false
  try {
    const storage = getSecureStorage()
    const existing = storage.read()
    if (!existing) return true
    delete existing.deepseekApiKey
    return storage.update(existing).success
  } catch {
    return false
  }
}

export function getDeepSeekApiKey(): string | null {
  const envKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (envKey) return envKey
  return getStoredDeepSeekApiKey()
}

export function getDeepSeekApiKeyWithSource(): {
  key: string | null
  source: 'DEEPSEEK_API_KEY' | '/login managed key' | 'none'
} {
  const envKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (envKey) {
    return { key: envKey, source: 'DEEPSEEK_API_KEY' }
  }
  const storedKey = getStoredDeepSeekApiKey()
  if (storedKey) {
    return { key: storedKey, source: '/login managed key' }
  }
  return { key: null, source: 'none' }
}

export function getDeepSeekBaseUrl(): string {
  return process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL
}

export function resolveDeepSeekModel(model?: string): string {
  const configuredModel = process.env.DEEPSEEK_MODEL?.trim()
  const trimmedModel = model?.trim() ?? ''
  const modelWithoutTag = trimmedModel.replace(/\[(1|2)m\]$/i, '')
  const normalizedModel = modelWithoutTag.toLowerCase()

  if (!normalizedModel || normalizedModel.startsWith('claude-')) {
    return configuredModel || DEFAULT_DEEPSEEK_MODEL
  }
  if (Object.hasOwn(DEEPSEEK_MODEL_ALIASES, normalizedModel)) {
    return configuredModel || DEEPSEEK_MODEL_ALIASES[normalizedModel]!
  }
  return modelWithoutTag
}

export function getAPIProvider(): APIProvider {
  return isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)
    ? 'bedrock'
    : isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)
      ? 'vertex'
      : isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)
        ? 'foundry'
        : isEnvTruthy(process.env.CLAUDE_CODE_USE_DEEPSEEK) ||
            process.env.DEEPSEEK_API_KEY?.trim()
          ? 'deepseek'
          : 'firstParty'
}

export function getAPIProviderForStatsig(): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  return getAPIProvider() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
}

/**
 * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
 * Returns true if not set (default API) or points to api.anthropic.com
 * (or api-staging.anthropic.com for ant users).
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) {
    return true
  }
  try {
    const host = new URL(baseUrl).host
    const allowedHosts = ['api.anthropic.com']
    if (process.env.USER_TYPE === 'ant') {
      allowedHosts.push('api-staging.anthropic.com')
    }
    return allowedHosts.includes(host)
  } catch {
    return false
  }
}
