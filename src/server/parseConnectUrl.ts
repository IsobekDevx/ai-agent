export type ParsedConnectUrl = {
  serverUrl: string
  authToken?: string
}

/** Reject connection URLs rather than attempting unsupported network access. */
export function parseConnectUrl(_url: string): ParsedConnectUrl {
  throw new Error('Direct Connect is unavailable in this build')
}
