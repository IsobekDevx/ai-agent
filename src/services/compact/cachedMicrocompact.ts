export type CacheEditsBlock = {
  type: "cache_edits"
  edits: Array<{ type: "delete"; cache_reference: string }>
}

export type PinnedCacheEdits = {
  userMessageIndex: number
  block: CacheEditsBlock
}

export type CachedMCState = {
  registeredTools: Set<string>
  toolResults: Map<string, any>
  pendingEdits: CacheEditsBlock | null
  pinnedEdits: PinnedCacheEdits[]
}

export function isCachedMicrocompactEnabled(): boolean {
  return false
}
export function isModelSupportedForCacheEditing(_model: string): boolean {
  return false
}
export function getCachedMCConfig(): Record<string, any> {
  return {}
}
export function createCachedMCState(): CachedMCState {
  return {
    registeredTools: new Set(),
    toolResults: new Map(),
    pendingEdits: null,
    pinnedEdits: [],
  }
}
export function registerToolResult(_state: CachedMCState, _toolUseId: string, _tokens?: number): void {}
export function registerToolUse(_state: CachedMCState, _toolUseId: string, _toolName: string): void {}
export function getToolResultsToDelete(_state: CachedMCState, _turn: number): string[] {
  return []
}
export function createCacheEditsBlock(_ids: string[]): CacheEditsBlock | null {
  return null
}
export function markToolsSentToAPI(_state: CachedMCState): void {}
export function resetCachedMCState(_state?: CachedMCState): void {}
