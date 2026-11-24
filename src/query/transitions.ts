export type ContinueReason =
  | "next_turn"
  | "reactive_compact_retry"
  | "collapse_drain_retry"
  | "max_output_tokens_escalate"
  | "max_output_tokens_recovery"
  | "stop_hook_blocking"
  | "token_budget_continuation"
  | string

export type Continue = {
  reason: ContinueReason
  [key: string]: any
}

export type TerminalReason =
  | "completed"
  | "aborted_tools"
  | "aborted_streaming"
  | "prompt_too_long"
  | "image_error"
  | "model_error"
  | "max_turns"
  | "stop_hook_prevented"
  | "hook_stopped"
  | string

export type Terminal = {
  reason: TerminalReason
  error?: unknown
  [key: string]: any
}
