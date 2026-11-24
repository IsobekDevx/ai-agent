// Workflow scripts are unavailable in CLI-only builds. Initialization must
// remain side-effect free so importing tools.ts cannot register executable jobs.
export function initBundledWorkflows() {
  // Intentionally no bundled workflows are installed.
}
