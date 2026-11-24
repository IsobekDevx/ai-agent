import type { Message } from '../../types/message.js'

export async function getSessionTranscriptSection(): Promise<string | null> {
  return null
}

export function writeSessionTranscriptSegment(_messages: Message[]): void {}

export function flushOnDateChange(
  _messages: Message[],
  _currentDate: string,
): void {}

export function clearSessionTranscript(): void {}
