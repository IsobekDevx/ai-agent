// The skill generator is feature-gated and must not create files in fallback
// builds. Preserve the registration signature as a safe no-op.
export function registerRunSkillGeneratorSkill() {
  // Intentionally not registered in CLI-only builds.
}
