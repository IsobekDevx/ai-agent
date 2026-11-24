const ENABLED_FEATURES = new Set([]);
export function feature(name) {
  if (process.env[`CLAUDE_FEATURE_${name}`] === "1") {
    return true;
  }
  return ENABLED_FEATURES.has(name);
}
