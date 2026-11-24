export type Workflow = "claude" | "claude-review" | string
export type Warning = {
  title: string
  message: string
  instructions?: string[]
}
export type State = {
  step: string
  repo?: string
  workflows?: Workflow[]
  warnings?: Warning[]
  error?: string
  [key: string]: any
}
