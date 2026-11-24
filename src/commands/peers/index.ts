import type { Command } from '../../types/command.js'

const peers = {
  type: 'local',
  name: 'peers',
  description: 'Manage peer sessions',
  isEnabled: () => false,
  isHidden: true,
  supportsNonInteractive: false,
  load: () =>
    Promise.resolve({
      call: async () => ({
        type: 'text' as const,
        value: '/peers is unavailable in this build',
      }),
    }),
} satisfies Command

export default peers
