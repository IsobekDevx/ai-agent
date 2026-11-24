import {
  APIConnectionTimeoutError,
  APIError
} from "@anthropic-ai/sdk/error";
import {
  getDeepSeekApiKey,
  getDeepSeekBaseUrl,
  resolveDeepSeekModel
} from "../../utils/model/providers.js";
import { validateBoundedIntEnvVar } from "../../utils/envValidation.js";
import { sleep } from "../../utils/sleep.js";
class DeepSeekAPIError extends APIError {
  responseBody;
  constructor(message, status, responseBody, headers) {
    let parsedError;
    try {
      const json = JSON.parse(responseBody);
      if (json && typeof json === "object") {
        parsedError = json.error ?? json;
      }
    } catch {
    }
    super(
      status,
      parsedError ? { ...parsedError, message } : { message },
      message,
      headers ? Object.fromEntries(headers) : void 0
    );
    this.name = "DeepSeekAPIError";
    this.message = message;
    this.responseBody = responseBody;
  }
}
function formatDeepSeekStatusError(status, responseBody, model) {
  let detail = "";
  try {
    const parsed = JSON.parse(responseBody);
    const msg = parsed?.error?.message || parsed?.message;
    if (typeof msg === "string" && msg.trim()) {
      detail = msg.trim();
    }
  } catch {
    if (responseBody.trim()) {
      detail = responseBody.trim().slice(0, 300);
    }
  }
  detail = detail.replace(/sk-[a-zA-Z0-9_-]{6,}/g, "sk-***");
  const suffix = detail ? ` (${detail})` : "";
  switch (status) {
    case 400:
      return `DeepSeek API Error (400 Invalid Request): Please check request parameters or message format${suffix}`;
    case 401:
      return `DeepSeek API Error (401 Invalid API Key): Authentication failed. Set a valid DEEPSEEK_API_KEY or run /login to configure your key${suffix}`;
    case 402:
      return `DeepSeek API Error (402 Insufficient Balance): Your DeepSeek account has insufficient balance. Please top up your DeepSeek account${suffix}`;
    case 403:
      return `DeepSeek API Error (403 Permission/Access Error): Access to this resource or model is forbidden${suffix}`;
    case 404:
      return `DeepSeek API Error (404 Not Found): Invalid endpoint or unsupported model${model ? ` '${model}'` : ""}${suffix}`;
    case 408:
      return `DeepSeek API Error (408 Timeout): The request timed out${suffix}`;
    case 429:
      return `DeepSeek API Error (429 Rate Limit): Rate limit or concurrency limit reached. Please wait and retry${suffix}`;
    case 500:
      return `DeepSeek API Error (500 Server Error): DeepSeek internal server error${suffix}`;
    case 502:
      return `DeepSeek API Error (502 Gateway Error): Bad gateway from DeepSeek upstream${suffix}`;
    case 503:
      return `DeepSeek API Error (503 Service Unavailable): DeepSeek service is temporarily overloaded or unavailable${suffix}`;
    default:
      return `DeepSeek API Error (${status}): Request failed${suffix}`;
  }
}
function isRetryableDeepSeekStatus(status) {
  if (status === 400 || status === 401 || status === 402 || status === 403 || status === 404) {
    return false;
  }
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status >= 500;
}
function getDeepSeekEndpoint(baseUrl) {
  const rawBaseUrl = baseUrl?.trim() || getDeepSeekBaseUrl();
  const normalizedBaseUrl = rawBaseUrl.replace(/\/+$/, "");
  try {
    const parsed = new URL(normalizedBaseUrl);
    if (parsed.hostname.endsWith("anthropic.com") || parsed.hostname.endsWith("claude.ai")) {
      throw new Error(
        `Blocked attempt to contact Anthropic endpoint (${parsed.hostname}) from DeepSeek API client.`
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Blocked attempt")) {
      throw err;
    }
  }
  return normalizedBaseUrl.endsWith("/chat/completions") ? normalizedBaseUrl : `${normalizedBaseUrl}/chat/completions`;
}
function getHeaders(apiKey) {
  return new Headers({
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream"
  });
}
function createRequestSignal(options) {
  const timeoutMs = options.timeoutMs ?? validateBoundedIntEnvVar(
    "API_TIMEOUT_MS",
    process.env.API_TIMEOUT_MS,
    6e5,
    2147483647
  ).effective;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return {
    signal: options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal,
    timeoutSignal
  };
}
async function readErrorBody(response) {
  try {
    return (await response.text()).slice(0, 64e3);
  } catch {
    return "";
  }
}
async function* readSSEData(response, signal) {
  if (!response.body) {
    throw new Error("DeepSeek returned a response without a body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const onAbort = () => {
    void reader.cancel().catch(() => {
    });
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  let buffer = "";
  const extractLines = (block) => {
    const dataLines = [];
    for (const rawLine of block.split(/\r?\n/)) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith(":")) {
        continue;
      }
      if (trimmed.startsWith("data:")) {
        const payload = trimmed.slice(5).trimStart();
        if (payload) dataLines.push(payload);
      }
    }
    return dataLines;
  };
  try {
    while (true) {
      if (signal?.aborted) {
        throw new Error("Request was aborted.");
      }
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
      }
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      for (const event of events) {
        const payloads = extractLines(event);
        if (payloads.length > 0) yield payloads.join("\n");
      }
      if (done) break;
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
    }
  }
  if (buffer.trim()) {
    const payloads = extractLines(buffer);
    if (payloads.length > 0) yield payloads.join("\n");
  }
}
async function* streamDeepSeekChat(request, options = {}) {
  const apiKey = options.apiKey?.trim() || getDeepSeekApiKey();
  if (!apiKey) {
    throw new DeepSeekAPIError(
      formatDeepSeekStatusError(
        401,
        JSON.stringify({
          error: {
            message: "DEEPSEEK_API_KEY is missing. Set DEEPSEEK_API_KEY or run /login."
          }
        }),
        request.model
      ),
      401,
      '{"error":{"message":"DEEPSEEK_API_KEY is missing"}}'
    );
  }
  const maxRetries = options.maxRetries ?? 2;
  const endpoint = getDeepSeekEndpoint(options.baseUrl);
  const { signal: requestSignal, timeoutSignal } = createRequestSignal(options);
  const throwIfAborted = () => {
    if (options.signal?.aborted) {
      throw new Error("Request was aborted.");
    }
    if (timeoutSignal.aborted) {
      throw new APIConnectionTimeoutError({ message: "Request timed out" });
    }
  };
  let response;
  let attempt = 0;
  while (true) {
    throwIfAborted();
    try {
      response = await (options.fetch ?? fetch)(endpoint, {
        method: "POST",
        headers: getHeaders(apiKey),
        body: JSON.stringify({
          ...request,
          stream: true,
          stream_options: { include_usage: true, ...request.stream_options }
        }),
        signal: requestSignal
      });
    } catch (networkErr) {
      throwIfAborted();
      if (networkErr instanceof Error && networkErr.name === "AbortError") {
        throw new Error("Request was aborted.");
      }
      if (attempt < maxRetries) {
        attempt++;
        await sleep(Math.min(1e3 * attempt, 3e3), requestSignal);
        throwIfAborted();
        continue;
      }
      throw networkErr;
    }
    if (!response.ok) {
      const responseBody = await readErrorBody(response);
      throwIfAborted();
      const formattedMessage = formatDeepSeekStatusError(
        response.status,
        responseBody,
        request.model
      );
      const apiErr = new DeepSeekAPIError(
        formattedMessage,
        response.status,
        responseBody,
        response.headers
      );
      if (isRetryableDeepSeekStatus(response.status) && attempt < maxRetries) {
        attempt++;
        await sleep(Math.min(1e3 * attempt, 3e3), requestSignal);
        throwIfAborted();
        continue;
      }
      throw apiErr;
    }
    break;
  }
  let sawDone = false;
  let sawFinishReason = false;
  try {
    for await (const data of readSSEData(response, requestSignal)) {
      if (data === "[DONE]") {
        sawDone = true;
        return;
      }
      let chunk;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (!chunk || typeof chunk !== "object") {
        continue;
      }
      if (Array.isArray(chunk.choices)) {
        for (const choice of chunk.choices) {
          if (choice?.finish_reason) {
            sawFinishReason = true;
          }
        }
      }
      yield chunk;
    }
  } catch (error) {
    throwIfAborted();
    throw error;
  }
  throwIfAborted();
  if (!sawDone && !sawFinishReason) {
    throw new Error("DeepSeek stream interrupted before completion");
  }
}
async function verifyDeepSeekApiKey(options = {}) {
  const apiKey = options.apiKey?.trim() || getDeepSeekApiKey();
  if (!apiKey) return false;
  const model = resolveDeepSeekModel(options.model);
  const { signal: requestSignal, timeoutSignal } = createRequestSignal(options);
  let response;
  try {
    response = await (options.fetch ?? fetch)(
      getDeepSeekEndpoint(options.baseUrl),
      {
        method: "POST",
        headers: getHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
          stream: false
        }),
        signal: requestSignal
      }
    );
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new APIConnectionTimeoutError({ message: "Request timed out" });
    }
    if (requestSignal.aborted) {
      throw new Error("Request was aborted.");
    }
    throw error;
  }
  if (response.status === 401) {
    return false;
  }
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new DeepSeekAPIError(
      formatDeepSeekStatusError(response.status, body, model),
      response.status,
      body,
      response.headers
    );
  }
  return true;
}
export {
  DeepSeekAPIError,
  formatDeepSeekStatusError,
  getDeepSeekEndpoint,
  isRetryableDeepSeekStatus,
  streamDeepSeekChat,
  verifyDeepSeekApiKey
};
//# sourceMappingURL=deepseekClient.js.map
