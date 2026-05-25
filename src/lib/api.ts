import { invoke } from "@tauri-apps/api/core"
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager"
import { changeKeysToCamelCase, changeKeysToKebabCase, formatOptionsForEngine } from "@/lib/format"
import type { AriaTask, Dict, EngineInfo, GlobalStat, PreferenceConfig, Peer } from "@/lib/types"

const compactUndefined = (arr: unknown[]) => arr.filter((item) => item !== undefined)

const mergeTaskResult = (response: AriaTask[][][] = []) => {
  let result: AriaTask[] = []
  for (const item of response) result = result.concat(...item)
  return result
}

export const native = {
  getConfig: async () =>
    changeKeysToCamelCase((await invoke("get_app_config")) as Dict) as PreferenceConfig,
  saveConfig: async (config: Dict) => {
    const kebab = changeKeysToKebabCase(config)
    const user: Dict = {}
    const system: Dict = {}
    Object.entries(kebab).forEach(([key, value]) => {
      if (systemKeys.has(key)) system[key] = value
      else user[key] = value
    })
    await invoke("save_app_config", { payload: { user, system } })
  },
  revealInFolder: (path: string) => invoke("reveal_in_folder", { path }),
  openPath: (path: string) => invoke("open_path", { path }),
  trashPath: (path: string) => invoke("trash_path", { path }),
  windowAction: (action: string) => invoke("window_action", { action }),
  resetSession: () => invoke("reset_session"),
  resetAppConfig: () => invoke("reset_app_config"),
  randomSecret: () => invoke<string>("random_secret"),
  fetchText: (url: string, proxy?: Dict) => invoke<string>("fetch_text", { url, proxy }),
  readClipboardText: () => readText(),
  writeClipboardText: (text: string) => writeText(text),
}

const aria2Call = async <T = unknown>(method: string, params: unknown[] = []) =>
  invoke<T>("aria2", { request: { method, params } })

export const api = {
  getVersion: () => aria2Call<EngineInfo>("getVersion"),
  getOption: async (gid: string) =>
    changeKeysToCamelCase((await aria2Call<Dict>("getOption", compactUndefined([gid]))) ?? {}) as Dict,
  changeOption: (gid: string, options: Dict) =>
    aria2Call("changeOption", compactUndefined([gid, formatOptionsForEngine(options)])),
  getGlobalStat: async () => {
    const data = await aria2Call<Record<string, string>>("getGlobalStat")
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Number(value)])) as GlobalStat
  },
  addUri: ({ uris, outs, options }: { uris: string[]; outs?: string[]; options: Dict }) => {
    const tasks = uris.map((uri, index) => {
      const engineOptions = formatOptionsForEngine(options)
      if (outs?.[index]) engineOptions.out = outs[index]
      return ["aria2.addUri", [uri], engineOptions]
    })
    return aria2Call("multicall", [tasks])
  },
  addTorrent: ({ torrent, options }: { torrent: string; options: Dict }) =>
    aria2Call("addTorrent", compactUndefined([torrent, [], formatOptionsForEngine(options)])),
  fetchDownloadingTaskList: async () => {
    const data = await aria2Call<AriaTask[][][]>("multicall", [
      [
        ["aria2.tellActive"],
        ["aria2.tellWaiting", 0, 20],
      ],
    ])
    return mergeTaskResult(data)
  },
  fetchWaitingTaskList: () => aria2Call<AriaTask[]>("tellWaiting", [0, 20]),
  fetchStoppedTaskList: () => aria2Call<AriaTask[]>("tellStopped", [0, 20]),
  fetchActiveTaskList: () => aria2Call<AriaTask[]>("tellActive"),
  fetchTaskList: (type: string) => {
    if (type === "waiting") return api.fetchWaitingTaskList()
    if (type === "stopped") return api.fetchStoppedTaskList()
    return api.fetchDownloadingTaskList()
  },
  fetchTaskItem: (gid: string) => aria2Call<AriaTask>("tellStatus", [gid]),
  fetchTaskItemWithPeers: async (gid: string) => {
    const data = await aria2Call<[AriaTask[], Peer[]][]>("multicall", [
      [
        ["aria2.tellStatus", gid],
        ["aria2.getPeers", gid],
      ],
    ])
    const task = data[0]?.[0] as unknown as AriaTask
    task.peers = (data[1]?.[0] as unknown as Peer[]) ?? []
    return task
  },
  pauseTask: (gid: string) => aria2Call("pause", [gid]),
  forcePauseTask: (gid: string) => aria2Call("forcePause", [gid]),
  pauseAllTask: () => aria2Call("pauseAll"),
  forcePauseAllTask: () => aria2Call("forcePauseAll"),
  resumeTask: (gid: string) => aria2Call("unpause", [gid]),
  resumeAllTask: () => aria2Call("unpauseAll"),
  removeTask: (gid: string) => aria2Call("remove", [gid]),
  removeTaskRecord: (gid: string) => aria2Call("removeDownloadResult", [gid]),
  purgeTaskRecord: () => aria2Call("purgeDownloadResult"),
  saveSession: () => aria2Call("saveSession"),
  batch: (method: string, gids: string[], options: Dict = {}) =>
    aria2Call("multicall", [gids.map((gid) => [method, gid, formatOptionsForEngine(options)])]),
}

const systemKeys = new Set([
  "all-proxy",
  "all-proxy-passwd",
  "all-proxy-user",
  "allow-overwrite",
  "auto-file-renaming",
  "bt-exclude-tracker",
  "bt-force-encryption",
  "bt-load-saved-metadata",
  "bt-save-metadata",
  "bt-tracker",
  "continue",
  "dht-file-path",
  "dht-file-path6",
  "dht-listen-port",
  "dir",
  "enable-dht6",
  "follow-metalink",
  "follow-torrent",
  "listen-port",
  "max-concurrent-downloads",
  "max-connection-per-server",
  "max-download-limit",
  "max-overall-download-limit",
  "max-overall-upload-limit",
  "no-proxy",
  "pause-metadata",
  "pause",
  "rpc-listen-port",
  "rpc-secret",
  "seed-ratio",
  "seed-time",
  "split",
  "user-agent",
])
