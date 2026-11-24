export type NotebookCellType = "code" | "markdown" | "raw"

export type NotebookCellSource = string | string[]

export type NotebookOutputImage = {
  image_data: string
  media_type: "image/png" | "image/jpeg" | "image/gif" | "image/webp"
}

export type NotebookCellSourceOutput = {
  output_type: string
  text?: string | string[]
  data?: Record<string, any>
  ename?: string
  evalue?: string
  traceback?: string[]
  image?: NotebookOutputImage
}

export type NotebookCellOutput = NotebookCellSourceOutput

export type ProcessedNotebookCellOutput = {
  output_type: string
  text?: string
  image?: NotebookOutputImage
}

export type ProcessedNotebookCell = {
  cellType: NotebookCellType
  source: string
  execution_count?: number
  cell_id: string
  language?: string
  outputs?: NotebookCellSourceOutput[]
}

export type NotebookCell = {
  cell_type: NotebookCellType
  id?: string
  source: NotebookCellSource
  metadata: Record<string, any>
  execution_count?: number | null
  outputs?: NotebookCellOutput[]
}

export type NotebookContent = {
  cells: NotebookCell[]
  metadata: Record<string, any>
  nbformat: number
  nbformat_minor: number
}
