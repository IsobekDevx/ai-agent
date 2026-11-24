import type { Command } from '../../types/command.js'

const buddy = {
  type: 'local',
  name: 'buddy',
  description: 'Manage your companion',
  isEnabled: () => false,
  isHidden: true,
  supportsNonInteractive: false,
  load: () =>
    Promise.resolve({
      call: async () => ({
        type: 'text' as const,
        value: '/buddy is unavailable in this build',
      }),
    }),
} satisfies Command

export default buddy
