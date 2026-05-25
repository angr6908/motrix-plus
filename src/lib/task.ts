import { ADD_TASK_TYPE, NONE_SELECTED_FILES, SELECTED_ALL_FILES } from "@/lib/constants"
import { splitTaskLinks } from "@/lib/format"
import type { PreferenceConfig } from "@/lib/types"

type TaskForm = Record<string, any>

export const initTaskForm = (
  config: PreferenceConfig,
  addTaskUrl = "",
  addTaskOptions: Record<string, unknown> = {},
) => ({
  allProxy: config.allProxy ?? "",
  cookie: "",
  dir: config.dir,
  engineMaxConnectionPerServer: config.engineMaxConnectionPerServer,
  followMetalink: config.followMetalink,
  followTorrent: config.followTorrent,
  maxConnectionPerServer: config.maxConnectionPerServer,
  newTaskShowDownloading: config.newTaskShowDownloading,
  out: "",
  referer: "",
  selectFile: NONE_SELECTED_FILES,
  split: config.split,
  torrent: "",
  uris: addTaskUrl,
  userAgent: "",
  authorization: "",
  ...addTaskOptions,
})

export const buildHeader = (form: TaskForm) => {
  const result: string[] = []
  if (form.userAgent) result.push(`User-Agent: ${form.userAgent}`)
  if (form.referer) result.push(`Referer: ${form.referer}`)
  if (form.cookie) result.push(`Cookie: ${form.cookie}`)
  if (form.authorization) result.push(`Authorization: ${form.authorization}`)
  return result
}

export const buildOption = (type: string, form: TaskForm) => {
  const result: Record<string, unknown> = {}
  if (form.allProxy) result.allProxy = form.allProxy
  if (form.dir) result.dir = form.dir
  if (form.out) result.out = form.out
  if (form.split > 0) result.split = form.split
  if (
    type === ADD_TASK_TYPE.TORRENT &&
    form.selectFile !== SELECTED_ALL_FILES &&
    form.selectFile !== NONE_SELECTED_FILES
  ) {
    result.selectFile = form.selectFile
  }
  const header = buildHeader(form)
  if (header.length) result.header = header
  return result
}

export const buildUriPayload = (form: TaskForm) => {
  if (!form.uris) throw new Error("task.new-task-uris-required")
  const uris = splitTaskLinks(form.uris)
  const outs = buildOuts(uris, form.out)
  return { uris, outs, options: buildOption(ADD_TASK_TYPE.URI, form) }
}

export const buildTorrentPayload = (form: TaskForm) => {
  if (!form.torrent) throw new Error("task.new-task-torrent-required")
  return { torrent: form.torrent, options: buildOption(ADD_TASK_TYPE.TORRENT, form) }
}

const buildOuts = (uris: string[], out = "") => {
  if (!out) return []
  if (uris.length === 1) return [out]
  return uris.map((_, index) => `${index + 1}-${out}`)
}
