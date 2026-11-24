// Dream mode is feature-gated. Keep the registration entry point resolvable
// without exposing a skill that could start background work.
export function registerDreamSkill() {
  // Intentionally not registered in CLI-only builds.
}
