import type { Command } from '../types/command.js'

const forceSnip = {
  type: 'local',
  name: 'force-snip',
  description: 'Force a context snip',
  isEnabled: () => false,
  isHidden: true,
  supportsNonInteractive: false,
  load: () =>
    Promise.resolve({
      call: async () => ({
        type: 'text' as const,
        value: '/force-snip is unavailable in this build',
      }),
    }),
} satisfies Command

export default forceSnip
