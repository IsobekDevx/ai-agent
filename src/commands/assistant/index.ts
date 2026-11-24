import type { Command } from '../../types/command.js'

const assistant = {
  type: 'local',
  name: 'assistant',
  description: 'Manage the assistant',
  isEnabled: () => false,
  isHidden: true,
  supportsNonInteractive: false,
  load: () =>
    Promise.resolve({
      call: async () => ({
        type: 'text' as const,
        value: '/assistant is unavailable in this build',
      }),
    }),
} satisfies Command

export default assistant
