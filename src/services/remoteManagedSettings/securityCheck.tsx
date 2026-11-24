import type { SettingsJson } from "../../utils/settings/types.js"

export type SecurityCheckResult = {
  approved: boolean
  reason?: string
}

export async function checkManagedSettingsSecurity(
  _previousSettings: SettingsJson | null,
  _newSettings: SettingsJson,
): Promise<SecurityCheckResult> {
  return { approved: true }
}

export function handleSecurityCheckResult(result: SecurityCheckResult): boolean {
  return result.approved
}
