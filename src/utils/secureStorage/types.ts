export type SecureStorageData = {
  claudeAiOauth?: {
    accessToken: string
    refreshToken: string
    expiresAt: number
    scopes: string[]
    subscriptionType?: string | null
    rateLimitTier?: string | null
  }
  mcpOAuth?: Record<string, any>
  deepseekApiKey?: string
  [key: string]: any
}

export interface SecureStorage {
  name: string
  isAvailable(): boolean
  read(): SecureStorageData | null
  readAsync?(): Promise<SecureStorageData | null>
  update(data: SecureStorageData): { success: boolean; warning?: string }
  delete(): boolean
}
