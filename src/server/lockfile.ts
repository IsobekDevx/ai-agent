export type ServerLock = {
  pid: number
  port: number
  host: string
  httpUrl: string
  startedAt: number
}

/** No filesystem access or process probing in the feature-gated fallback. */
export async function probeRunningServer(): Promise<ServerLock | null> {
  return null
}

export async function writeServerLock(_lock: ServerLock): Promise<void> {}

export async function removeServerLock(): Promise<void> {}
