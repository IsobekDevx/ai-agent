export function isProactiveActive(): boolean {
  return false
}
export function isProactiveEnabled(): boolean {
  return false
}
export function isProactivePaused(): boolean {
  return false
}
export function pauseProactive(): void {}
export function resumeProactive(): void {}
export function deactivateProactive(): void {}
export function activateProactive(): void {}
export function getNextTickAt(): number | null {
  return null
}
export function subscribeToProactiveChanges(_cb: () => void): () => void {
  return () => {}
}
export function getProactiveSystemPromptSection(): string {
  return ""
}
