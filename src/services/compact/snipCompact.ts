import type { Message } from '../../types/message.js'

export const SNIP_NUDGE_TEXT = ''

export function isSnipCompactEnabled(): boolean {
  return false
}

export function isSnipRuntimeEnabled(): boolean {
  return false
}

export function isSnipBoundaryMessage(msg: unknown): boolean {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { subtype?: string }).subtype === 'snip_boundary'
  )
}

export function isSnipMarkerMessage(_msg: unknown): boolean {
  return false
}

export function shouldNudgeForSnips(_messages: Message[]): boolean {
  return false
}

export function snipCompactIfNeeded(
  messages: Message[],
  _options?: { force?: boolean },
): {
  messages: Message[]
  tokensFreed: number
  executed: boolean
  boundaryMessage?: undefined
} {
  return { messages, tokensFreed: 0, executed: false }
}

export function createSnipReplay(): undefined {
  return undefined
}
