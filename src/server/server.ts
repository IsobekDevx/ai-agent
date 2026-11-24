import type { SessionManager } from './sessionManager.js'
import type { ServerLogger } from './serverLog.js'
import type { ServerConfig } from './types.js'

export type ServerHandle = {
  readonly port?: number
  stop(force?: boolean): void
}

/** Import-safe fallback: invocation fails instead of opening a listener. */
export function startServer(
  _config: ServerConfig,
  _sessionManager: SessionManager,
  _logger: ServerLogger,
): ServerHandle {
  throw new Error('The Direct Connect server is unavailable in this build')
}
