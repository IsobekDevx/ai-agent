export type DiscoverySignal = {
  type: string
  source?: string
  paths?: string[]
  query?: string
  [key: string]: any
}
