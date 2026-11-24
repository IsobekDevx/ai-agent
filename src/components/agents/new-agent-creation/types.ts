export type AgentWizardData = {
  name?: string
  description?: string
  systemPrompt?: string
  tools?: string[]
  disallowedTools?: string[]
  model?: string
  color?: string
  location?: "project" | "user" | string
  method?: "generate" | "manual" | string
  [key: string]: any
}
