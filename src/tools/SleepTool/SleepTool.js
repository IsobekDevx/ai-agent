import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { SLEEP_TOOL_NAME } from './prompt.js'

const DISABLED_MESSAGE = `${SLEEP_TOOL_NAME} is disabled in this build.`

export const SleepTool = buildTool({
  name: SLEEP_TOOL_NAME,
  maxResultSizeChars: 10_000,
  inputSchema: z.looseObject({}),
  isEnabled: () => false,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isOpenWorld: () => false,
  async description() {
    return DISABLED_MESSAGE
  },
  async prompt() {
    return DISABLED_MESSAGE
  },
  async call() {
    throw new Error(DISABLED_MESSAGE)
  },
  mapToolResultToToolResultBlockParam(_output, toolUseID) {
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: DISABLED_MESSAGE,
      is_error: true,
    }
  },
  renderToolUseMessage() {
    return null
  },
})
