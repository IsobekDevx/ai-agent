export type SSHSessionManager = {
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  status: string
  [key: string]: any
}
