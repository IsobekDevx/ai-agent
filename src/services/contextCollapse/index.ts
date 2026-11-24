import type { Message } from "../../types/message.js"

export type ContextCollapseStats = {
  collapsedSpans: number
  stagedSpans: number
  totalTokensSaved: number
  [key: string]: any
}

export function isContextCollapseEnabled(): boolean {
  return false
}

export function initContextCollapse(): void {}
export function resetContextCollapse(): void {}
export function subscribeToProactiveChanges(_cb: () => void): () => void {
  return () => {}
}
export function getStats(): ContextCollapseStats {
  return { collapsedSpans: 0, stagedSpans: 0, totalTokensSaved: 0 }
}
export async function applyCollapsesIfNeeded(messages: Message[]): Promise<{ messages: Message[] }> {
  return { messages }
}
export function ProjectView(messages: Message[]): Message[] {
  return messages
}
export function recoverFromOverflow(_messages: Message[]): { committed: number; messages: Message[] } {
  return { committed: 0, messages: _messages }
}
