function unavailable(operation: string): Error {
  return new Error(`Background sessions are unavailable in this build (${operation})`)
}

export async function psHandler(_args: string[]): Promise<void> {
  throw unavailable('ps')
}

export async function logsHandler(_sessionId: string | undefined): Promise<void> {
  throw unavailable('logs')
}

export async function attachHandler(_sessionId: string | undefined): Promise<void> {
  throw unavailable('attach')
}

export async function killHandler(_sessionId: string | undefined): Promise<void> {
  throw unavailable('kill')
}

export async function handleBgFlag(_args: string[]): Promise<void> {
  throw unavailable('--background')
}
