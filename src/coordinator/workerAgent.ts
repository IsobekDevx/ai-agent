import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'

/** Coordinator workers are not registered when coordinator mode is disabled. */
export function getCoordinatorAgents(): AgentDefinition[] {
  return []
}
