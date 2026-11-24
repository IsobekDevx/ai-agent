export function getUdsMessagingSocketPath(): string | undefined {
  return undefined
}
export function getDefaultUdsSocketPath(): string {
  return ""
}
export async function startUdsMessaging(_path: string): Promise<void> {}
export function setOnEnqueue(_cb: (msg: any) => void): void {}
