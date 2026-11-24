// Artifact review is feature-gated. Keep the registration entry point
// resolvable without exposing a disabled skill.
export function registerHunterSkill() {
  // Intentionally not registered in CLI-only builds.
}
