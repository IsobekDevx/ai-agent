import type { Command } from '../../types/command.js'

const remoteControlServer = {
  type: 'local',
  name: 'remote-control-server',
  description: 'Manage the Remote Control server',
  isEnabled: () => false,
  isHidden: true,
  supportsNonInteractive: false,
  load: () =>
    Promise.resolve({
      call: async () => ({
        type: 'text' as const,
        value: '/remote-control-server is unavailable in this build',
      }),
    }),
} satisfies Command

export default remoteControlServer
