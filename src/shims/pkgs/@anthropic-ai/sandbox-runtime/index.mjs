import { z } from "zod";
export const SandboxRuntimeConfigSchema = z.any();
export class SandboxViolationStore {
  violations = [];
  addViolation(v) { this.violations.push(v); }
  getViolations() { return this.violations; }
  getTotalCount() { return this.violations.length; }
  clear() { this.violations = []; }
}
export const SandboxManager = {
  isSupportedPlatform: () => false,
  isSandboxingEnabled: () => false,
  checkDependencies: () => ({ warnings: [], errors: [] }),
  initialize: async () => {},
  reset: async () => {},
  updateConfig: () => {},
  wrapWithSandbox: async (cmd) => cmd,
  cleanupAfterCommand: () => {},
  getFsReadConfig: () => ({ denyOnly: [] }),
  getFsWriteConfig: () => ({ allowOnly: [], denyWithinAllow: [] }),
  getNetworkRestrictionConfig: () => ({}),
  getAllowUnixSockets: () => [],
  getAllowLocalBinding: () => false,
  getIgnoreViolations: () => ({}),
  getEnableWeakerNestedSandbox: () => false,
  getProxyPort: () => undefined,
  getSocksProxyPort: () => undefined,
  getLinuxHttpSocketPath: () => undefined,
  getLinuxSocksSocketPath: () => undefined,
  waitForNetworkInitialization: async () => false,
  getSandboxViolationStore: () => new SandboxViolationStore(),
  annotateStderrWithSandboxFailures: (cmd, stderr) => stderr,
  getLinuxGlobPatternWarnings: () => [],
};
