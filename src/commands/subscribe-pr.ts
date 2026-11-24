import type { Command } from '../types/command.js'

const subscribePr = {
  type: 'local',
  name: 'subscribe-pr',
  description: 'Subscribe a pull request to bridge updates',
  isEnabled: () => false,
  isHidden: true,
  supportsNonInteractive: false,
  load: () =>
    Promise.resolve({
      call: async () => ({
        type: 'text' as const,
        value: '/subscribe-pr is unavailable in this build',
      }),
    }),
} satisfies Command

export default subscribePr
