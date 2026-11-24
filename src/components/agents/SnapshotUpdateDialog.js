import { useEffect, useRef } from 'react'

// Snapshot updates are unavailable in CLI-only builds. Resolve the launcher
// with its non-destructive default instead of leaving the setup dialog open.
export function SnapshotUpdateDialog({
  agentType,
  scope,
  snapshotTimestamp,
  onComplete,
  onCancel,
}) {
  const cancelled = useRef(false)

  useEffect(() => {
    if (cancelled.current) return
    cancelled.current = true
    onCancel()
  }, [onCancel])

  return null
}

export function buildMergePrompt(agentType, scope) {
  return 'Agent memory snapshot updates are disabled in this build.'
}
