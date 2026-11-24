import { useEffect, useRef } from 'react'

// Snapshot updates are unavailable in CLI-only builds. Resolve the launcher
// with its non-destructive default instead of leaving the setup dialog open.
export function SnapshotUpdateDialog({ onCancel, ..._props }) {
  const cancelled = useRef(false)

  useEffect(() => {
    if (cancelled.current) return
    cancelled.current = true
    onCancel()
  }, [onCancel])

  return null
}

export function buildMergePrompt(_agentType, _scope) {
  return 'Agent memory snapshot updates are disabled in this build.'
}
