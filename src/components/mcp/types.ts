export type StdioServerInfo = {
  type: "stdio"
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  scope?: string
  status?: string
  [key: string]: any
}

export type SSEServerInfo = {
  type: "sse"
  name: string
  url: string
  headers?: Record<string, string>
  scope?: string
  status?: string
  [key: string]: any
}

export type HTTPServerInfo = {
  type: "http"
  name: string
  url: string
  headers?: Record<string, string>
  scope?: string
  status?: string
  [key: string]: any
}

export type ClaudeAIServerInfo = {
  type: "claudeai" | "claude.ai"
  name: string
  url?: string
  status?: string
  [key: string]: any
}

export type AgentMcpServerInfo = {
  type: "agent"
  name: string
  agentName?: string
  status?: string
  [key: string]: any
}

export type ServerInfo =
  | StdioServerInfo
  | SSEServerInfo
  | HTTPServerInfo
  | ClaudeAIServerInfo
  | AgentMcpServerInfo

export type MCPViewState = {
  type: string
  server?: ServerInfo
  [key: string]: any
}
