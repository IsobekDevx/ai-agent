export interface Transport {
  send(data: string | object): Promise<void> | void
  close(): Promise<void> | void
  onMessage?(handler: (msg: any) => void): void
  onClose?(handler: () => void): void
  onError?(handler: (err: Error) => void): void
  [key: string]: any
}
