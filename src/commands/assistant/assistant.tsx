import { homedir } from 'os'
import { join } from 'path'
import { useEffect } from 'react'

export type NewInstallWizardProps = {
  defaultDir: string
  onInstalled: (dir: string) => void
  onCancel: () => void
  onError: (message: string) => void
}

/** Feature-gated installer fallback: cancel without writing or spawning. */
export function NewInstallWizard({
  onCancel,
}: NewInstallWizardProps): null {
  useEffect(() => {
    onCancel()
  }, [onCancel])

  return null
}

export async function computeDefaultInstallDir(): Promise<string> {
  return join(homedir(), '.claude', 'assistant')
}
