import {
  AUDIO_SUFFIXES,
  DOCUMENT_SUFFIXES,
  IMAGE_SUFFIXES,
  MAX_BT_TRACKER_LENGTH,
  NONE_SELECTED_FILES,
  RESOURCE_TAGS,
  SELECTED_ALL_FILES,
  SUB_SUFFIXES,
  TASK_STATUS,
  UNKNOWN_PEERID,
  UNKNOWN_PEERID_NAME,
  VIDEO_SUFFIXES,
} from "@/lib/constants"
import type { AriaFile, AriaTask } from "@/lib/types"

export const bytesToSize = (bytes: string | number = 0, precision = 1) => {
  const b = Number.parseInt(String(bytes), 10)
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  if (!Number.isFinite(b) || b === 0) return "0 KB"
  const i = Number.parseInt(String(Math.floor(Math.log(b) / Math.log(1024))), 10)
  if (i === 0) return `${b} ${sizes[i]}`
  return `${(b / 1024 ** i).toFixed(precision)} ${sizes[i]}`
}

export const calcProgress = (
  totalLength: string | number = 0,
  completedLength: string | number = 0,
  decimal = 2,
) => {
  const total = Number.parseInt(String(totalLength), 10)
  const completed = Number.parseInt(String(completedLength), 10)
  if (total === 0 || completed === 0) return 0
  return Number.parseFloat(((completed / total) * 100).toFixed(decimal))
}

export const calcRatio = (totalLength: string | number = 0, uploadLength: string | number = 0) => {
  const total = Number.parseInt(String(totalLength), 10)
  const upload = Number.parseInt(String(uploadLength), 10)
  if (total === 0 || upload === 0) return 0
  return Number.parseFloat((upload / total).toFixed(4))
}

export const timeRemaining = (
  totalLength: string | number = 0,
  completedLength: string | number = 0,
  downloadSpeed: string | number = 0,
) => Math.ceil((Number(totalLength) - Number(completedLength)) / Number(downloadSpeed || 0))

export const timeFormat = (seconds = 0, prefix = "Remaining") => {
  if (!Number.isFinite(seconds) || seconds <= 0) return ""
  if (seconds > 86400) return `${prefix} > 1 day`
  let secs = seconds
  let result = ""
  if (secs > 3600) {
    result += `${Math.floor(secs / 3600)}h `
    secs %= 3600
  }
  if (secs > 60) {
    result += `${Math.floor(secs / 60)}m `
    secs %= 60
  }
  result += `${secs}s`
  return `${prefix} ${result}`
}

const ellipsis = (str = "", maxLen = 64) => {
  if (maxLen < 0 || str.length < maxLen) return str
  return `${str.substring(0, maxLen)}...`
}

export const getFileName = (fullPath = "") => fullPath.replace(/^.*[\\/]/, "")

export const getFileExtension = (filename = "") =>
  filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2)

export const removeExtensionDot = (extension = "") => extension.replace(".", "")

export const getFileNameFromFile = (file?: AriaFile) => {
  if (!file) return ""
  let path = file.path || ""
  if (!path && file.uris?.length) {
    try {
      path = decodeURI(file.uris[0].uri)
    } catch {
      path = file.uris[0].uri
    }
  }
  const index = path.lastIndexOf("/")
  if (index <= 0 || index === path.length) return path
  return path.substring(index + 1)
}

export const checkTaskIsBT = (task?: Partial<AriaTask> | null) => !!task?.bittorrent

export const isMagnetTask = (task?: Partial<AriaTask> | null) =>
  !!task?.bittorrent && !task.bittorrent.info

const checkTaskIsSeeder = (task?: Partial<AriaTask> | null) =>
  !!task?.bittorrent && task.seeder === "true"

export const taskStatus = (task: AriaTask) =>
  checkTaskIsSeeder(task) ? TASK_STATUS.SEEDING : task.status

export const getTaskName = (
  task?: Partial<AriaTask> | null,
  options: { defaultName?: string; maxLen?: number } = {},
) => {
  const { defaultName = "", maxLen = 64 } = options
  if (!task) return defaultName
  let result = defaultName
  const files = task.files ?? []
  if (task.bittorrent?.info?.name) {
    result = task.bittorrent.info.name
  } else if (files.length === 1) {
    result = getFileNameFromFile(files[0])
  }
  return ellipsis(result, maxLen)
}

export const getTaskUri = (task: AriaTask, withTracker = false, btTracker: string[] = []) => {
  if (checkTaskIsBT(task)) return buildMagnetLink(task, withTracker, btTracker)
  if (task.files?.length === 1) return task.files[0]?.uris?.[0]?.uri ?? ""
  return ""
}

const buildMagnetLink = (task: AriaTask, withTracker = false, btTracker: string[] = []) => {
  const params = [`magnet:?xt=urn:btih:${task.infoHash ?? ""}`]
  const name = task.bittorrent?.info?.name
  if (name) params.push(`dn=${encodeURI(name)}`)
  if (withTracker) {
    const trackers = (task.bittorrent?.announceList ?? [])
      .map((i) => i[0])
      .filter((tracker) => !btTracker.includes(tracker))
    trackers.forEach((tracker) => params.push(`tr=${encodeURI(tracker)}`))
  }
  return params.join("&")
}

export const getTaskFullPath = (task: AriaTask) => {
  let result = task.dir || ""
  if (isMagnetTask(task)) return result
  if (task.bittorrent?.info?.name) return `${result}/${task.bittorrent.info.name}`
  const [file] = task.files ?? []
  if (file?.path) return file.path
  const fileName = getFileNameFromFile(file)
  return fileName ? `${result}/${fileName}` : result
}

const splitTextRows = (text = "") =>
  `${text}`
    .replace(/(?:\\\r\\\n|\\\r|\\\n)/g, " ")
    .replace(/(?:\r\n|\r|\n)/g, "\n")
    .split("\n")
    .map((row) => row.trim())

export const convertCommaToLine = (text = "") =>
  `${text}`
    .split(",")
    .map((row) => row.trim())
    .join("\n")
    .trim()

export const convertLineToComma = (text = "") => text.trim().replace(/(?:\r\n|\r|\n)/g, ",")

export const reduceTrackerString = (text = "") => {
  if (text.length <= MAX_BT_TRACKER_LENGTH) return text
  const clipped = text.substring(0, MAX_BT_TRACKER_LENGTH)
  const index = clipped.lastIndexOf(",")
  return index === -1 ? clipped : clipped.substring(0, index)
}

export const decodeThunderLink = (url = "") => {
  if (!url.startsWith("thunder://")) return url
  try {
    const raw = atob(url.trim().split("thunder://")[1] ?? "")
    return raw.substring(2, raw.length - 2)
  } catch {
    return url
  }
}

export const splitTaskLinks = (links = "") =>
  splitTextRows(links).filter(Boolean).map((item) => decodeThunderLink(item))

export const detectResource = (content = "") => RESOURCE_TAGS.some((type) => content.includes(type))

export const formatOptionsForEngine = (options: Record<string, unknown> = {}) => {
  const result: Record<string, string> = {}
  Object.entries(options).forEach(([key, value]) => {
    const kebab = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
    result[kebab] = Array.isArray(value) ? value.join("\n") : `${value}`
  })
  return result
}

export const changeKeysToCamelCase = (obj: Record<string, unknown> = {}) =>
  Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase()),
      value,
    ]),
  )

export const changeKeysToKebabCase = (obj: Record<string, unknown> = {}) =>
  Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`),
      value,
    ]),
  )

const filterFiles = (files: AriaFile[], suffixes: string[]) =>
  files.filter((item) => suffixes.includes(item.extension ?? ""))

export const filterVideoFiles = (files: AriaFile[]) => filterFiles(files, [...VIDEO_SUFFIXES, ...SUB_SUFFIXES])
export const filterAudioFiles = (files: AriaFile[]) => filterFiles(files, AUDIO_SUFFIXES)
export const filterImageFiles = (files: AriaFile[]) => filterFiles(files, IMAGE_SUFFIXES)
export const filterDocumentFiles = (files: AriaFile[]) => filterFiles(files, DOCUMENT_SUFFIXES)

export const listTorrentFiles = (files: { path: string; length: number }[]) =>
  files.map((file, index) => {
    const extension = getFileExtension(file.path)
    return {
      idx: index + 1,
      extension: `.${extension}`,
      selected: true,
      name: getFileName(file.path),
      completedLength: 0,
      ...file,
    }
  })

export const getFileSelection = (files: AriaFile[]) => {
  const selectedFiles = files.filter((file) => file.selected)
  if (files.length === 0 || selectedFiles.length === 0) return NONE_SELECTED_FILES
  if (files.length === selectedFiles.length) return SELECTED_ALL_FILES
  return selectedFiles.map((item) => item.idx).join(",")
}

export const bitfieldToPercent = (text = "") => {
  const len = text.length - 1
  let one = 0
  for (let i = 0; i < len; i += 1) {
    let p = Number.parseInt(text[i] ?? "0", 16)
    for (let j = 0; j < 4; j += 1) {
      one += p & 1
      p >>= 1
    }
  }
  return len > 0 ? Math.floor((one / (4 * len)) * 100).toString() : "0"
}

export const peerIdParser = (str = "") => {
  if (!str || str === UNKNOWN_PEERID) return UNKNOWN_PEERID_NAME
  try {
    return decodeURIComponent(str).replace(/[^\x20-\x7E]/g, "") || UNKNOWN_PEERID_NAME
  } catch {
    return UNKNOWN_PEERID_NAME
  }
}

export const extractSpeedUnit = (speed: string | number = "") => {
  if (Number.parseInt(String(speed)) === 0) return "K"
  const match = /^(\d+\.?\d*)([KMG])$/.exec(String(speed))
  return match?.[2] ?? "K"
}

export const diffConfig = <T extends Record<string, unknown>>(current: T, next: T) =>
  Object.fromEntries(
    Object.entries(next).filter(([key, value]) => JSON.stringify(current[key]) !== JSON.stringify(value)),
  )

export const pushItemToFixedLengthArray = <T>(arr: T[] = [], maxLength: number, item: T) =>
  arr.length >= maxLength ? [...arr.slice(1), item] : [...arr, item]

export const randomPort = (min = 0, max = 10000) => min + Math.floor(Math.random() * (max - min))
