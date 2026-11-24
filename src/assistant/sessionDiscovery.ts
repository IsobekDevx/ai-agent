export type AssistantSession = {
  id: string
  sessionId?: string
  title?: string
  cwd?: string
  createdAt?: string | number
  updatedAt?: string | number
  status?: string
  [key: string]: any
}
export async function discoverAssistantSessions(): Promise<AssistantSession[]> {
  return []
}
