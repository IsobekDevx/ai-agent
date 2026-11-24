export type LspServerConfig = {
  command: string
  args?: string[]
  env?: Record<string, string>
  initializationOptions?: Record<string, unknown>
  settings?: Record<string, unknown>
  extensionToLanguage?: Record<string, string>
  workspaceFolder?: string
  timeout?: number
  [key: string]: any
}

export type ScopedLspServerConfig = LspServerConfig & {
  scope?: "project" | "user" | "plugin" | "dynamic" | string
  pluginName?: string
}

export type LspServerState = "not-started" | "starting" | "running" | "stopped" | "error" | "pending"
