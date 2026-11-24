import type React from "react"

export type WizardContextValue<T = any> = {
  data: T
  updateData: (partial: Partial<T>) => void
  nextStep: () => void
  prevStep: () => void
  goToStep: (index: number) => void
  currentStepIndex: number
  totalSteps: number
  cancel: () => void
  complete: (finalData?: T) => void
  [key: string]: any
}

export type WizardStepComponent<T = any> = React.ComponentType<{
  data?: T
  onNext?: () => void
  onBack?: () => void
  onCancel?: () => void
  [key: string]: any
}>

export type WizardProviderProps<T = any> = {
  initialData: T
  steps: WizardStepComponent<T>[]
  onComplete: (data: T) => void
  onCancel: () => void
  title?: string
  children?: React.ReactNode
  [key: string]: any
}
