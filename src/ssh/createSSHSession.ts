export type SSHSession = {
  id: string
  host: string
  close: () => Promise<void>
  [key: string]: any
}

export async function createSSHSession(_opts: any): Promise<SSHSession> {
  throw new Error("SSH remote session is not enabled in this build.")
}
