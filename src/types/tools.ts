export type BashProgress = {
  type: "bash_progress"
  output: string
  fullOutput: string
  elapsedTimeSeconds: number
  totalLines: number
  totalBytes?: number
  taskId?: string
  timeoutMs?: number
}

export type PowerShellProgress = {
  type: "powershell_progress"
  output: string
  fullOutput: string
  elapsedTimeSeconds: number
  totalLines: number
  totalBytes?: number
  taskId?: string
  timeoutMs?: number
}

export type AgentToolProgress = {
  type: "agent_progress"
  message?: any
  normalizedMessages?: any[]
  prompt?: string
  resume?: string
  agentId?: string
  toolUseCount?: number
  tokens?: number
  [key: string]: any
}

export type MCPProgress = {
  type: "mcp_progress"
  status?: "started" | "progress" | "completed" | "failed" | string
  serverName: string
  toolName: string
  progress?: number
  total?: number
  message?: string
  elapsedTimeMs?: number
  [key: string]: any
}

export type WebSearchProgress = {
  type: "web_search_progress" | "query_update" | "search_results_received"
  query?: string
  resultCount?: number
  [key: string]: any
}

export type SkillToolProgress = {
  type: "skill_progress"
  skillName?: string
  status?: string
  [key: string]: any
}

export type TaskOutputProgress = {
  type: "task_output_progress"
  taskId?: string
  output?: string
  [key: string]: any
}

export type REPLToolProgress = {
  type: "repl_progress"
  output?: string
  [key: string]: any
}

export type SdkWorkflowProgress = {
  type: "sdk_workflow_progress" | "workflow_progress"
  workflowName?: string
  status?: string
  [key: string]: any
}

export type ToolProgressData =
  | BashProgress
  | PowerShellProgress
  | AgentToolProgress
  | MCPProgress
  | WebSearchProgress
  | SkillToolProgress
  | TaskOutputProgress
  | REPLToolProgress
  | SdkWorkflowProgress
  | { type: string; [key: string]: any }
