import type React from "react"

export type TipContext = {
  theme?: string
  model?: string
  isSubscriber?: boolean
  [key: string]: any
}

export type Tip = {
  id: string
  content: (ctx: TipContext) => string | React.ReactNode | Promise<string | React.ReactNode>
  cooldownSessions?: number
  isEnabled?: (ctx: TipContext) => boolean | Promise<boolean>
  isRelevant?: (ctx: TipContext) => boolean | Promise<boolean>
}
