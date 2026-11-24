import type { Command } from '../../types/command.js'

const workflows = {
  type: 'local',
  name: 'workflows',
  description: 'Manage workflow scripts',
  isEnabled: () => false,
  isHidden: true,
  supportsNonInteractive: false,
  load: () =>
    Promise.resolve({
      call: async () => ({
        type: 'text' as const,
        value: '/workflows is unavailable in this build',
      }),
    }),
} satisfies Command

export default workflows
