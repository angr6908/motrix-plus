export type Dict<T = unknown> = Record<string, T>

export type PreferenceConfig = Dict & {
  theme: string
  locale: string
  dir: string
  rpcListenPort: number
  rpcSecret: string
  split: number
  maxConnectionPerServer: number
  engineMaxConnectionPerServer: number
  maxConcurrentDownloads: number
  maxOverallDownloadLimit: string | number
  maxOverallUploadLimit: string | number
  btTracker: string
  trackerSource: string[]
  proxy: { enable: boolean; server: string; bypass: string; scope: string[] }
  protocols: { magnet: boolean; thunder: boolean }
  favoriteDirectories: string[]
  historyDirectories: string[]
  taskNotification: boolean
  newTaskShowDownloading: boolean
  noConfirmBeforeDeleteTask: boolean
}

export type AriaFile = {
  index?: string
  idx?: number
  path: string
  name?: string
  extension?: string
  length: string | number
  completedLength?: string | number
  selected?: string | boolean
  uris?: { uri: string }[]
}

export type AriaTask = {
  gid: string
  status: string
  totalLength: string
  completedLength: string
  uploadLength?: string
  bitfield?: string
  downloadSpeed: string
  uploadSpeed: string
  connections: string
  numSeeders?: string
  dir: string
  files: AriaFile[]
  bittorrent?: {
    info?: { name?: string }
    announceList?: string[][]
    creationDate?: number
    comment?: string
  }
  infoHash?: string
  pieceLength?: string
  numPieces?: string
  seeder?: string
  errorCode?: string
  errorMessage?: string
  peers?: Peer[]
}

export type Peer = {
  ip: string
  port: string
  peerId: string
  bitfield: string
  uploadSpeed: string
  downloadSpeed: string
}

export type GlobalStat = {
  downloadSpeed: number
  uploadSpeed: number
  numActive: number
  numWaiting: number
  numStopped: number
}

export type EngineInfo = {
  version: string
  enabledFeatures: string[]
}
