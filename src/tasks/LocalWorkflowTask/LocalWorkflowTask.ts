import type { TaskStateBase } from "../types.js"

export type LocalWorkflowTaskState = TaskStateBase & {
  type: "local_workflow"
  workflowName: string
  summary?: string
  output?: string
  error?: string
  [key: string]: any
}

export function isLocalWorkflowTask(task: any): task is LocalWorkflowTaskState {
  return task?.type === "local_workflow"
}
