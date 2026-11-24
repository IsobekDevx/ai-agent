import type { DangerousBackend } from './backends/dangerousBackend.js'

export type SessionManagerOptions = {
  idleTimeoutMs?: number
  maxSessions?: number
}

/** Inert session owner: no child processes, timers, or listeners are created. */
export class SessionManager {
  constructor(
    _backend: DangerousBackend,
    _options: SessionManagerOptions = {},
  ) {}

  async destroyAll(): Promise<void> {}
}
