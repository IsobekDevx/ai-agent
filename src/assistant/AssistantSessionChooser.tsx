import { useEffect } from 'react'
import type { AssistantSession } from './sessionDiscovery.js'

export type AssistantSessionChooserProps = {
  sessions: AssistantSession[]
  onSelect: (id: string) => void
  onCancel: () => void
}

/** Feature-gated chooser fallback: cancel without rendering interactive UI. */
export function AssistantSessionChooser({
  onCancel,
}: AssistantSessionChooserProps): null {
  useEffect(() => {
    onCancel()
  }, [onCancel])

  return null
}
