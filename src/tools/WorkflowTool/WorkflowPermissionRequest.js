import { useEffect, useRef } from 'react'

// Fail closed if a disabled Workflow call reaches the permission UI.
export function WorkflowPermissionRequest({ onReject }) {
  const rejected = useRef(false)

  useEffect(() => {
    if (rejected.current) return
    rejected.current = true
    onReject()
  }, [onReject])

  return null
}
