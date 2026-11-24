import { isBareMode, isEnvTruthy } from "../envUtils.js";
import { getSecureStorage } from "../secureStorage/index.js";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-flash";
const ALTERNATIVE_DEEPSEEK_MODEL = "deepseek-v4-pro";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const SUPPORTED_DEEPSEEK_MODELS = [
  "deepseek-flash",
  "deepseek-v4-pro",
  "deepseek-chat",
  "deepseek-reasoner"
];
const DEEPSEEK_MODEL_ALIASES = {
  best: "deepseek-v4-pro",
  opus: "deepseek-v4-pro",
  opusplan: "deepseek-v4-pro",
  sonnet: "deepseek-flash",
  haiku: "deepseek-flash"
};
function getStoredDeepSeekApiKey() {
  if (isBareMode()) return null;
  try {
    const data = getSecureStorage().read();
    if (data && typeof data.deepseekApiKey === "string" && data.deepseekApiKey.trim()) {
      return data.deepseekApiKey.trim();
    }
  } catch {
  }
  return null;
}
function saveStoredDeepSeekApiKey(apiKey) {
  if (isBareMode()) return false;
  try {
    const storage = getSecureStorage();
    const existing = storage.read() ?? {};
    return storage.update({
      ...existing,
      deepseekApiKey: apiKey.trim()
    }).success;
  } catch {
    return false;
  }
}
function clearStoredDeepSeekApiKey() {
  if (isBareMode()) return false;
  try {
    const storage = getSecureStorage();
    const existing = storage.read();
    if (!existing) return true;
    delete existing.deepseekApiKey;
    return storage.update(existing).success;
  } catch {
    return false;
  }
}
function getDeepSeekApiKey() {
  const envKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (envKey) return envKey;
  return getStoredDeepSeekApiKey();
}
function getDeepSeekApiKeyWithSource() {
  const envKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (envKey) {
    return { key: envKey, source: "DEEPSEEK_API_KEY" };
  }
  const storedKey = getStoredDeepSeekApiKey();
  if (storedKey) {
    return { key: storedKey, source: "/login managed key" };
  }
  return { key: null, source: "none" };
}
function getDeepSeekBaseUrl() {
  return process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL;
}
function resolveDeepSeekModel(model) {
  const configuredModel = process.env.DEEPSEEK_MODEL?.trim();
  const trimmedModel = model?.trim() ?? "";
  const modelWithoutTag = trimmedModel.replace(/\[(1|2)m\]$/i, "");
  const normalizedModel = modelWithoutTag.toLowerCase();
  if (!normalizedModel || normalizedModel.startsWith("claude-")) {
    return configuredModel || DEFAULT_DEEPSEEK_MODEL;
  }
  if (Object.hasOwn(DEEPSEEK_MODEL_ALIASES, normalizedModel)) {
    return configuredModel || DEEPSEEK_MODEL_ALIASES[normalizedModel];
  }
  return modelWithoutTag;
}
function getAPIProvider() {
  return isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) ? "bedrock" : isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) ? "vertex" : isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY) ? "foundry" : isEnvTruthy(process.env.CLAUDE_CODE_USE_DEEPSEEK) || process.env.DEEPSEEK_API_KEY?.trim() ? "deepseek" : "firstParty";
}
function getAPIProviderForStatsig() {
  return getAPIProvider();
}
function isFirstPartyAnthropicBaseUrl() {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (!baseUrl) {
    return true;
  }
  try {
    const host = new URL(baseUrl).host;
    const allowedHosts = ["api.anthropic.com"];
    if (process.env.USER_TYPE === "ant") {
      allowedHosts.push("api-staging.anthropic.com");
    }
    return allowedHosts.includes(host);
  } catch {
    return false;
  }
}
export {
  ALTERNATIVE_DEEPSEEK_MODEL,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  SUPPORTED_DEEPSEEK_MODELS,
  clearStoredDeepSeekApiKey,
  getAPIProvider,
  getAPIProviderForStatsig,
  getDeepSeekApiKey,
  getDeepSeekApiKeyWithSource,
  getDeepSeekBaseUrl,
  getStoredDeepSeekApiKey,
  isFirstPartyAnthropicBaseUrl,
  resolveDeepSeekModel,
  saveStoredDeepSeekApiKey
};
//# sourceMappingURL=providers.js.map
