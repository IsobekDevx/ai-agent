import type { TaskStateBase } from "../types.js"

export type MonitorMcpTaskState = TaskStateBase & {
  type: "monitor_mcp"
  command: string
  description?: string
  serverName?: string
  output?: string
  error?: string
  [key: string]: any
}

export function isMonitorMcpTask(task: any): task is MonitorMcpTaskState {
  return task?.type === "monitor_mcp"
}
