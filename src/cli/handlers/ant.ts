import type { Command } from 'commander'

function unavailable(operation: string): Error {
  return new Error(`The ant-only ${operation} command is unavailable in this build`)
}

export type TaskCreateOptions = {
  description?: string
  list?: string
}

export type TaskListOptions = {
  list?: string
  pending?: boolean
  json?: boolean
}

export type TaskGetOptions = {
  list?: string
}

export type TaskUpdateOptions = {
  list?: string
  status?: string
  subject?: string
  description?: string
  owner?: string
  clearOwner?: boolean
}

export type CompletionOptions = {
  output?: string
}

export async function logHandler(_logId?: string | number): Promise<void> {
  throw unavailable('log')
}

export async function errorHandler(_number?: number): Promise<void> {
  throw unavailable('error')
}

export async function exportHandler(
  _source: string,
  _outputFile: string,
): Promise<void> {
  throw unavailable('export')
}

export async function taskCreateHandler(
  _subject: string,
  _options: TaskCreateOptions,
): Promise<void> {
  throw unavailable('task create')
}

export async function taskListHandler(
  _options: TaskListOptions,
): Promise<void> {
  throw unavailable('task list')
}

export async function taskGetHandler(
  _id: string,
  _options: TaskGetOptions,
): Promise<void> {
  throw unavailable('task get')
}

export async function taskUpdateHandler(
  _id: string,
  _options: TaskUpdateOptions,
): Promise<void> {
  throw unavailable('task update')
}

export async function taskDirHandler(
  _options: TaskGetOptions,
): Promise<void> {
  throw unavailable('task dir')
}

export async function completionHandler(
  _shell: string,
  _options: CompletionOptions,
  _program: Command,
): Promise<void> {
  throw unavailable('completion')
}
