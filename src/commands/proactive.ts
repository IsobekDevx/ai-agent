import type { Command } from '../types/command.js'

const proactive = {
  type: 'local',
  name: 'proactive',
  description: 'Manage proactive mode',
  isEnabled: () => false,
  isHidden: true,
  supportsNonInteractive: false,
  load: () =>
    Promise.resolve({
      call: async () => ({
        type: 'text' as const,
        value: '/proactive is unavailable in this build',
      }),
    }),
} satisfies Command

export default proactive
