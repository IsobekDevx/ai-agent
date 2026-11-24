export type InterClaudeMessageResult = {
  ok: boolean
  error?: string
}

/** Fail safely when cross-session peer messaging is not included in this build. */
export async function postInterClaudeMessage(
  _target: string,
  _message: string,
): Promise<InterClaudeMessageResult> {
  return {
    ok: false,
    error: 'Peer messaging is unavailable in this build',
  }
}
