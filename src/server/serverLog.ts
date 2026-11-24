export type ServerLogger = {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

/** Create a side-effect-free logger for builds without the server feature. */
export function createServerLogger(): ServerLogger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  }
}
