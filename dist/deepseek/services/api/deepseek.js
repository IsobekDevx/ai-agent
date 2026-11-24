import { APIUserAbortError } from "@anthropic-ai/sdk/error";
import { addToTotalSessionCost } from "../../cost-tracker.js";
import {
  toolMatchesName
} from "../../Tool.js";
import { getAttributionHeader, getCLISyspromptPrefix } from "../../constants/system.js";
import { toolToAPISchema } from "../../utils/api.js";
import { computeFingerprintFromMessages } from "../../utils/fingerprint.js";
import { getModelMaxOutputTokens } from "../../utils/context.js";
import { validateBoundedIntEnvVar } from "../../utils/envValidation.js";
import {
  ensureToolResultPairing,
  normalizeMessagesForAPI
} from "../../utils/messages.js";
import { resolveDeepSeekModel } from "../../utils/model/providers.js";
import { calculateUSDCost } from "../../utils/modelCost.js";
import {
  asSystemPrompt
} from "../../utils/systemPromptType.js";
import { TOOL_SEARCH_TOOL_NAME } from "../../tools/ToolSearchTool/prompt.js";
import {
  createToolNameMapper,
  deepSeekChunksToEvents,
  toDeepSeekMessages,
  toDeepSeekResponseFormat,
  toDeepSeekToolChoice,
  toDeepSeekTools
} from "./deepseekAdapter.js";
import { streamDeepSeekChat } from "./deepseekClient.js";
import { getAssistantMessageFromError } from "./errors.js";
async function* queryDeepSeekModel(messages, systemPrompt, thinkingConfig, tools, signal, options) {
  const model = resolveDeepSeekModel(options.model);
  const availableTools = tools.filter(
    (tool) => !toolMatchesName(tool, TOOL_SEARCH_TOOL_NAME)
  );
  const toolSchemas = await Promise.all(
    availableTools.map(
      (tool) => toolToAPISchema(tool, {
        getToolPermissionContext: options.getToolPermissionContext,
        tools,
        agents: options.agents,
        allowedAgentTypes: options.allowedAgentTypes,
        model
      })
    )
  );
  const allSchemas = [...toolSchemas, ...options.extraToolSchemas ?? []];
  const mapper = createToolNameMapper(
    allSchemas.map((s) => s && typeof s === "object" && "name" in s && typeof s.name === "string" ? s.name : "").filter(Boolean)
  );
  const normalizedMessages = ensureToolResultPairing(
    normalizeMessagesForAPI(messages, availableTools)
  ).filter(
    (message) => message.type === "user" || message.type === "assistant"
  );
  const fingerprint = computeFingerprintFromMessages(normalizedMessages);
  const prompt = asSystemPrompt(
    [
      getAttributionHeader(fingerprint),
      getCLISyspromptPrefix({
        isNonInteractive: options.isNonInteractiveSession,
        hasAppendSystemPrompt: options.hasAppendSystemPrompt
      }),
      ...systemPrompt
    ].filter(Boolean)
  );
  const limits = getModelMaxOutputTokens(model);
  const maxTokens = validateBoundedIntEnvVar(
    "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
    process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS,
    limits.default,
    limits.upperLimit
  ).effective;
  const responseFormat = toDeepSeekResponseFormat(options.outputFormat);
  const toolChoice = toDeepSeekToolChoice(options.toolChoice, mapper);
  const deepSeekTools = toDeepSeekTools(allSchemas, mapper);
  try {
    const chunks = streamDeepSeekChat(
      {
        model,
        messages: toDeepSeekMessages(normalizedMessages, prompt, mapper),
        ...deepSeekTools.length > 0 && { tools: deepSeekTools },
        ...toolChoice !== void 0 && { tool_choice: toolChoice },
        ...responseFormat && { response_format: responseFormat },
        max_tokens: options.maxOutputTokensOverride ?? maxTokens,
        ...thinkingConfig.type === "disabled" && !model.includes("reasoner") && {
          temperature: options.temperatureOverride ?? 1
        }
      },
      {
        fetch: options.fetchOverride,
        signal
      }
    );
    for await (const event of deepSeekChunksToEvents(chunks, model, mapper)) {
      if (event.type === "assistant") {
        const usage = event.message.usage;
        const cost = calculateUSDCost(model, usage);
        event.costUSD = addToTotalSessionCost(cost, usage, model);
      }
      yield event;
    }
  } catch (error) {
    if (signal.aborted || error instanceof APIUserAbortError || error instanceof Error && (error.name === "AbortError" || error.message === "Request was aborted.")) {
      return;
    }
    yield getAssistantMessageFromError(error, model, {
      messages,
      messagesForAPI: []
    });
  }
}
export {
  queryDeepSeekModel
};
//# sourceMappingURL=deepseek.js.map
