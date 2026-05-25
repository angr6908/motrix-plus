export const APP_THEME = {
  AUTO: "auto",
  LIGHT: "light",
  DARK: "dark",
} as const

export const APP_RUN_MODE = {
  STANDARD: 1,
  TRAY: 2,
  HIDE_TRAY: 3,
} as const

export const ADD_TASK_TYPE = {
  URI: "uri",
  TORRENT: "torrent",
} as const

export const TASK_STATUS = {
  ACTIVE: "active",
  WAITING: "waiting",
  PAUSED: "paused",
  ERROR: "error",
  COMPLETE: "complete",
  REMOVED: "removed",
  SEEDING: "seeding",
} as const

export const NONE_SELECTED_FILES = "none"
export const SELECTED_ALL_FILES = "all"
export const ENGINE_MAX_CONCURRENT_DOWNLOADS = 10
export const ENGINE_RPC_PORT = 16800
export const MAX_NUM_OF_DIRECTORIES = 5
export const MAX_BT_TRACKER_LENGTH = 6144
export const UNKNOWN_PEERID =
  "%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00%00"
export const UNKNOWN_PEERID_NAME = "unknown"

export const RESOURCE_TAGS = ["http://", "https://", "ftp://", "magnet:", "thunder://"]
export const LOG_LEVELS = ["error", "warn", "info", "verbose", "debug", "silly"]
export const PROXY_SCOPE_OPTIONS = ["download", "update-app", "update-trackers"]

export const TRACKER_SOURCE_OPTIONS = [
  {
    label: "ngosang/trackerslist",
    options: [
      ["https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt", "trackers_best.txt", false],
      ["https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best_ip.txt", "trackers_best_ip.txt", false],
      ["https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_all.txt", "trackers_all.txt", false],
      ["https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_all_ip.txt", "trackers_all_ip.txt", false],
      ["https://cdn.jsdelivr.net/gh/ngosang/trackerslist/trackers_best.txt", "trackers_best.txt", true],
      ["https://cdn.jsdelivr.net/gh/ngosang/trackerslist/trackers_best_ip.txt", "trackers_best_ip.txt", true],
      ["https://cdn.jsdelivr.net/gh/ngosang/trackerslist/trackers_all.txt", "trackers_all.txt", true],
      ["https://cdn.jsdelivr.net/gh/ngosang/trackerslist/trackers_all_ip.txt", "trackers_all_ip.txt", true],
    ].map(([value, label, cdn]) => ({ value, label, cdn })),
  },
  {
    label: "XIU2/TrackersListCollection",
    options: [
      ["https://raw.githubusercontent.com/XIU2/TrackersListCollection/master/best.txt", "best.txt", false],
      ["https://raw.githubusercontent.com/XIU2/TrackersListCollection/master/all.txt", "all.txt", false],
      ["https://raw.githubusercontent.com/XIU2/TrackersListCollection/master/http.txt", "http.txt", false],
      ["https://cdn.jsdelivr.net/gh/XIU2/TrackersListCollection/best.txt", "best.txt", true],
      ["https://cdn.jsdelivr.net/gh/XIU2/TrackersListCollection/all.txt", "all.txt", true],
      ["https://cdn.jsdelivr.net/gh/XIU2/TrackersListCollection/http.txt", "http.txt", true],
    ].map(([value, label, cdn]) => ({ value, label, cdn })),
  },
]

export const IMAGE_SUFFIXES = [
  ".ai", ".bmp", ".eps", ".fig", ".gif", ".heic", ".icn", ".ico", ".jpeg",
  ".jpg", ".png", ".psd", ".raw", ".sketch", ".svg", ".tif", ".webp", ".xd",
]
export const AUDIO_SUFFIXES = [".aac", ".ape", ".flac", ".flav", ".m4a", ".mp3", ".ogg", ".wav", ".wma"]
export const VIDEO_SUFFIXES = [".avi", ".m4v", ".mkv", ".mov", ".mp4", ".mpg", ".rmvb", ".vob", ".wmv"]
export const SUB_SUFFIXES = [".ass", ".idx", ".smi", ".srt", ".ssa", ".sst", ".sub"]
export const DOCUMENT_SUFFIXES = [
  ".azw3", ".csv", ".doc", ".docx", ".epub", ".key", ".mobi", ".numbers",
  ".pages", ".pdf", ".ppt", ".pptx", ".txt", ".xsl", ".xslx",
]

export const statusColors: Record<string, string> = {
  active: "#67C23A",
  waiting: "#909399",
  paused: "#E6A23C",
  error: "#F56C6C",
  complete: "#409EFF",
  removed: "#909399",
  seeding: "#67C23A",
}

export const availableLanguages = [
  { label: "English", value: "en-US" },
  { label: "简体中文", value: "zh-CN" },
  { label: "繁體中文", value: "zh-TW" },
  { label: "Deutsch", value: "de" },
  { label: "Español", value: "es" },
  { label: "Français", value: "fr" },
  { label: "Italiano", value: "it" },
  { label: "日本語", value: "ja" },
  { label: "한국어", value: "ko" },
  { label: "Português do Brasil", value: "pt-BR" },
  { label: "Русский", value: "ru" },
]
