export type UnifiedInstalledItem = {
  id: string
  name: string
  kind: "plugin" | "mcp" | "skill" | string
  enabled: boolean
  scope?: string
  description?: string
  error?: string
  [key: string]: any
}
