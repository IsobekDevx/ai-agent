export type ConnectorTextBlock = {
  type: "connector_text"
  text: string
  connector_id?: string
  [key: string]: unknown
}

export type ConnectorTextDelta = {
  type: "connector_text_delta"
  text: string
  [key: string]: unknown
}

export function isConnectorTextBlock(block: unknown): block is ConnectorTextBlock {
  return (
    typeof block === "object" &&
    block !== null &&
    "type" in block &&
    (block as { type?: unknown }).type === "connector_text"
  )
}
