import type { Command } from '../types/command.js'

const torch = {
  type: 'local',
  name: 'torch',
  description: 'Run Torch mode',
  isEnabled: () => false,
  isHidden: true,
  supportsNonInteractive: false,
  load: () =>
    Promise.resolve({
      call: async () => ({
        type: 'text' as const,
        value: '/torch is unavailable in this build',
      }),
    }),
} satisfies Command

export default torch
