import type { Command } from '../../types/command.js'

const agentsPlatform = {
  type: 'local',
  name: 'agents-platform',
  description: 'Manage platform agents',
  isEnabled: () => false,
  isHidden: true,
  supportsNonInteractive: false,
  load: () =>
    Promise.resolve({
      call: async () => ({
        type: 'text' as const,
        value: '/agents-platform is unavailable in this build',
      }),
    }),
} satisfies Command

export default agentsPlatform
