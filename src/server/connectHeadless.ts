import type { DirectConnectConfig } from './directConnectManager.js'

export async function runConnectHeadless(
  _config: DirectConnectConfig,
  _prompt: string,
  _outputFormat: string,
  _interactive: boolean,
): Promise<void> {
  throw new Error('Headless Direct Connect is unavailable in this build')
}
