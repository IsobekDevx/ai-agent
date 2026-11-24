import { z } from "zod/v4"
import { buildTool } from "../../Tool.js"

export const TungstenTool = buildTool({
  name: "Tungsten",
  maxResultSizeChars: 10000,
  isEnabled() {
    return false
  },
  async description() {
    return "Internal Tungsten tool (disabled)"
  },
  async prompt() {
    return ""
  },
  get inputSchema() {
    return z.object({})
  },
  get outputSchema() {
    return z.object({})
  },
  userFacingName() {
    return "Tungsten"
  },
  getToolUseSummary() {
    return null
  },
  renderToolUseMessage() {
    return null
  },
  renderToolResultMessage() {
    return null
  },
  renderToolUseRejectedMessage() {
    return null
  },
  renderToolUseErrorMessage() {
    return null
  },
  async call() {
    return { data: {} }
  },
  mapToolResultToToolResultBlockParam(_data, toolUseID) {
    return {
      type: "tool_result",
      tool_use_id: toolUseID,
      content: "Tungsten tool is not enabled.",
    }
  },
})
