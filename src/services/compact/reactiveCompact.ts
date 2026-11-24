import type { Message } from "../../types/message.js"

export function isReactiveCompactEnabled(): boolean {
  return false
}
export function isWithheldPromptTooLong(_msg: unknown): boolean {
  return false
}
export function isWithheldMediaSizeError(_msg: unknown): boolean {
  return false
}
export async function tryReactiveCompact(messages: Message[]): Promise<{ messages: Message[]; compacted: boolean }> {
  return { messages, compacted: false }
}
