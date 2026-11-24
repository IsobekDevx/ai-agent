import type { Command } from '../../types/command.js'

const fork = {
  type: 'local',
  name: 'fork',
  description: 'Fork the current conversation',
  argumentHint: '[directive]',
  isEnabled: () => false,
  isHidden: true,
  supportsNonInteractive: false,
  load: () =>
    Promise.resolve({
      call: async () => ({
        type: 'text' as const,
        value: '/fork is unavailable in this build',
      }),
    }),
} satisfies Command

export default fork
