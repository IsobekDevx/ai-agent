const ENABLED_FEATURES = new Set<string>([
  // Only enable standard features if needed; experimental/ant-only features remain false
])

export function feature(name: string): boolean {
  if (process.env[`CLAUDE_FEATURE_${name}`] === "1") {
    return true
  }
  return ENABLED_FEATURES.has(name)
}
