import { useEffect, useRef } from 'react'

// Fail closed if a disabled ReviewArtifact call reaches the permission UI.
export function ReviewArtifactPermissionRequest({ onReject }) {
  const rejected = useRef(false)

  useEffect(() => {
    if (rejected.current) return
    rejected.current = true
    onReject()
  }, [onReject])

  return null
}
