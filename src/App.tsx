import { invoke as tauriInvoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  CircleAlert,
  Dice5,
  ExternalLink,
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  Gauge,
  Info,
  Link,
  ListChecks,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  SquareX,
  StopCircle,
  Trash,
  Upload,
  X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ThemeProvider } from "next-themes"

import { api, native } from "@/lib/api"
import {
  ADD_TASK_TYPE,
  APP_RUN_MODE,
  APP_THEME,
  ENGINE_MAX_CONCURRENT_DOWNLOADS,
  ENGINE_RPC_PORT,
  LOG_LEVELS,
  MAX_NUM_OF_DIRECTORIES,
  NONE_SELECTED_FILES,
  PROXY_SCOPE_OPTIONS,
  SELECTED_ALL_FILES,
  TASK_STATUS,
  TRACKER_SOURCE_OPTIONS,
  availableLanguages,
  statusColors,
} from "@/lib/constants"
import {
  bitfieldToPercent,
  bytesToSize,
  calcProgress,
  calcRatio,
  checkTaskIsBT,
  convertCommaToLine,
  convertLineToComma,
  detectResource,
  diffConfig,
  extractSpeedUnit,
  filterAudioFiles,
  filterDocumentFiles,
  filterImageFiles,
  filterVideoFiles,
  getFileExtension,
  getFileName,
  getFileSelection,
  getTaskFullPath,
  getTaskName,
  getTaskUri,
  isMagnetTask,
  listTorrentFiles,
  peerIdParser,
  pushItemToFixedLengthArray,
  randomPort,
  reduceTrackerString,
  removeExtensionDot,
  taskStatus,
  timeFormat,
  timeRemaining,
} from "@/lib/format"
import { buildTorrentPayload, buildUriPayload, initTaskForm } from "@/lib/task"
import { t } from "@/lib/text"
import type { AriaFile, AriaTask, Dict, EngineInfo, GlobalStat, Peer, PreferenceConfig } from "@/lib/types"
import { cn } from "@/lib/utils"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"

import logoMini from "@/assets/motrix/logo-mini.svg"
import logo from "@/assets/motrix/logo.svg"
import noTask from "@/assets/motrix/no-task.svg"
import themeAuto from "@/assets/motrix/theme-auto@2x.png"
import themeDark from "@/assets/motrix/theme-dark@2x.png"
import themeLight from "@/assets/motrix/theme-light@2x.png"

type Page = "task" | "preference"
type PreferencePage = "basic" | "advanced" | "lab"
type SubnavItem = { key: string; title: string; icon: React.ReactNode; active: boolean; onClick: () => void }
type ConfirmState =
  | { open: false }
  | {
      open: true
      title: string
      message: string
      checkbox?: string
      checked?: boolean
      onConfirm: (checked: boolean) => void | Promise<void>
    }

const baseStat: GlobalStat = {
  downloadSpeed: 0,
  uploadSpeed: 0,
  numActive: 0,
  numWaiting: 0,
  numStopped: 0,
}
const PROXY_PLACEHOLDER = ["[http://]", "[USER:PASSWORD@]HOST[:PORT]"].join("")

function App() {
  const [ready, setReady] = useState(false)
  const [page, setPage] = useState<Page>("task")
  const [taskListStatus, setTaskListStatus] = useState("active")
  const [preferencePage, setPreferencePage] = useState<PreferencePage>("basic")
  const [preferenceDirty, setPreferenceDirty] = useState(false)
  const [config, setConfig] = useState<PreferenceConfig | null>(null)
  const [engineInfo, setEngineInfo] = useState<EngineInfo>({ version: "", enabledFeatures: [] })
  const [stat, setStat] = useState<GlobalStat>(baseStat)
  const [progress, setProgress] = useState(-1)
  const [intervalMs, setIntervalMs] = useState(1000)
  const [taskList, setTaskList] = useState<AriaTask[]>([])
  const [selectedGids, setSelectedGids] = useState<string[]>([])
  const [addTask, setAddTask] = useState<{
    visible: boolean
    type: "uri" | "torrent"
    url: string
    options: Dict
  }>({
    visible: false,
    type: ADD_TASK_TYPE.URI,
    url: "",
    options: {} as Dict,
  })
  const [aboutVisible, setAboutVisible] = useState(false)
  const [detail, setDetail] = useState<{
    visible: boolean
    gid: string
    task: AriaTask | null
    enabledPeers: boolean
  }>({ visible: false, gid: "", task: null, enabledPeers: false })
  const [confirm, setConfirm] = useState<ConfirmState>({ open: false })
  const previousStat = useRef(baseStat)
  const taskListStatusRef = useRef(taskListStatus)
  const pendingTaskListStatusRef = useRef(taskListStatus)

  const refreshConfig = useCallback(async () => {
    const next = await native.getConfig()
    setConfig(next)
    const theme = next.theme === APP_THEME.AUTO ? systemTheme() : next.theme
    document.documentElement.classList.toggle("dark", theme === APP_THEME.DARK)
    return next
  }, [])

  const refreshTasks = useCallback(async (status?: string) => {
    const requestedStatus = status ?? taskListStatusRef.current
    try {
      const tasks = await api.fetchTaskList(requestedStatus)
      if (requestedStatus !== taskListStatusRef.current) return
      setTaskList(tasks)
      setSelectedGids((current) => current.filter((gid) => tasks.some((task) => task.gid === gid)))
    } catch (error) {
      console.warn(error)
    }
  }, [])

  const changeTaskListStatus = useCallback(async (status: string) => {
    if (status === taskListStatusRef.current) {
      pendingTaskListStatusRef.current = status
      void refreshTasks(status)
      return
    }
    pendingTaskListStatusRef.current = status
    try {
      const tasks = await api.fetchTaskList(status)
      if (pendingTaskListStatusRef.current !== status) return
      taskListStatusRef.current = status
      setTaskListStatus(status)
      setTaskList(tasks)
      setSelectedGids((current) => current.filter((gid) => tasks.some((task) => task.gid === gid)))
    } catch (error) {
      if (pendingTaskListStatusRef.current === status) pendingTaskListStatusRef.current = taskListStatusRef.current
      console.warn(error)
    }
  }, [refreshTasks])

  const fetchEngineInfo = useCallback(async () => {
    try {
      setEngineInfo(await api.getVersion())
    } catch (error) {
      console.warn(error)
    }
  }, [])

  const fetchGlobalStat = useCallback(async () => {
    try {
      const next = await api.getGlobalStat()
      if (next.numActive > 0) setIntervalMs(Math.max(500, 1000 - 100 * next.numActive))
      else {
        next.downloadSpeed = 0
        setIntervalMs((current) => Math.min(6000, current + 100))
      }
      setStat((current) => {
        previousStat.current = current
        return next
      })
    } catch (error) {
      console.warn(error)
    }
  }, [])

  const fetchProgress = useCallback(async () => {
    try {
      const data = await api.fetchActiveTaskList()
      if (!data.length) {
        setProgress(-1)
        return
      }
      const tasks = data.filter((task) => Number(task.totalLength) !== 0)
      const total = tasks.reduce((sum, task) => sum + Number(task.totalLength), 0)
      if (total === 0) {
        setProgress(2)
        return
      }
      const completed = tasks.reduce((total, task) => total + Number(task.completedLength), 0)
      setProgress(completed / total)
    } catch (error) {
      console.warn(error)
    }
  }, [])

  const refreshDetail = useCallback(async () => {
    if (!detail.visible || !detail.gid) return
    try {
      const task = detail.enabledPeers
        ? await api.fetchTaskItemWithPeers(detail.gid)
        : await api.fetchTaskItem(detail.gid)
      setDetail((current) => ({ ...current, task }))
    } catch (error) {
      console.warn(error)
    }
  }, [detail.enabledPeers, detail.gid, detail.visible])

  useEffect(() => {
    void refreshConfig()
      .then(() => fetchEngineInfo())
      .then(() => refreshTasks("active"))
      .finally(() => setReady(true))
  }, [fetchEngineInfo, refreshConfig, refreshTasks])

  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => {
      void fetchGlobalStat()
      void fetchProgress()
      void refreshTasks()
      void refreshDetail()
    }, intervalMs)
    return () => window.clearTimeout(timer)
  }, [fetchGlobalStat, fetchProgress, intervalMs, ready, refreshDetail, refreshTasks])

  useEffect(() => {
    const unlisten = listen<{ kind: string; url?: string; file?: string; name?: string; dataUrl?: string }>(
      "motrix://add-task",
      ({ payload }) => {
        if (payload.kind === "torrent") {
          setAddTask({ visible: true, type: ADD_TASK_TYPE.TORRENT, url: "", options: { torrentDataUrl: payload.dataUrl, torrentName: payload.name } })
        } else {
          setAddTask({ visible: true, type: ADD_TASK_TYPE.URI, url: payload.url ?? "", options: {} })
        }
      },
    )
    return () => {
      void unlisten.then((off) => off())
    }
  }, [])

  useEffect(() => {
    if (ready && config) void native.windowAction("show")
  }, [config, ready])

  useEffect(() => {
    if (stat.downloadSpeed + stat.uploadSpeed !== previousStat.current.downloadSpeed + previousStat.current.uploadSpeed) {
      void tauriInvoke("app_event", { event: "speed-change", payload: stat })
    }
    if (stat.numActive !== previousStat.current.numActive) {
      void tauriInvoke("app_event", { event: "download-status-change", payload: stat.numActive > 0 })
    }
    if (progress >= 0) void tauriInvoke("app_event", { event: "progress-change", payload: progress })
  }, [progress, stat])

  const savePreference = useCallback(
    async (changed: Dict) => {
      if (!Object.keys(changed).length) return
      await native.saveConfig(changed)
      await refreshConfig()
      if ("rpcListenPort" in changed || "rpcSecret" in changed || "listenPort" in changed || "dhtListenPort" in changed) {
        toast.info("Restart Motrix to apply port or RPC changes")
      }
      void fetchEngineInfo()
      toast.success(t("preferences.save-success-message"))
    },
    [fetchEngineInfo, refreshConfig],
  )

  const showAddTask = (type = ADD_TASK_TYPE.URI, url = "", options: Dict = {}) =>
    setAddTask({ visible: true, type, url, options })

  const closeAddTask = () =>
    setAddTask({ visible: false, type: ADD_TASK_TYPE.URI, url: "", options: {} })

  const navigatePage = (next: Page) => {
    if (page === "preference" && next !== "preference" && preferenceDirty) {
      setConfirm({
        open: true,
        title: t("preferences.not-saved"),
        message: t("preferences.not-saved-confirm"),
        onConfirm: () => {
          setPreferenceDirty(false)
          setPage(next)
        },
      })
      return
    }
    setPage(next)
  }

  const showDetail = (task: AriaTask) => setDetail({ visible: true, gid: task.gid, task, enabledPeers: false })

  const removeFiles = async (task: AriaTask) => {
    if (isMagnetTask(task)) return
    const path = getTaskFullPath(task)
    if (!path || path === task.dir) throw new Error(t("task.file-path-error"))
    await native.trashPath(path)
    if (task.status !== TASK_STATUS.COMPLETE) await native.trashPath(`${path}.aria2`)
  }

  const removeTask = async (task: AriaTask, taskName: string, deleteWithFiles = false) => {
    try {
      if (task.status === TASK_STATUS.ACTIVE) await api.forcePauseTask(task.gid)
      if (deleteWithFiles) await removeFiles(task)
      await api.removeTask(task.gid)
      await api.saveSession()
      await refreshTasks()
      if (detail.gid === task.gid) setDetail({ visible: false, gid: "", task: null, enabledPeers: false })
      toast.success(t("task.delete-task-success", { taskName }))
    } catch {
      toast.error(t("task.delete-task-fail", { taskName }))
    }
  }

  const removeTaskRecord = async (task: AriaTask, taskName: string, deleteWithFiles = false) => {
    try {
      if (deleteWithFiles) await removeFiles(task)
      await api.removeTaskRecord(task.gid)
      await refreshTasks()
      toast.success(t("task.remove-record-success", { taskName }))
    } catch {
      toast.error(t("task.remove-record-fail", { taskName }))
    }
  }

  const confirmTaskDelete = (task: AriaTask, deleteWithFiles = false) => {
    const taskName = getTaskName(task)
    if (config?.noConfirmBeforeDeleteTask) void removeTask(task, taskName, deleteWithFiles)
    else {
      setConfirm({
        open: true,
        title: t("task.delete-task"),
        message: t("task.delete-task-confirm", { taskName }),
        checkbox: t("task.delete-task-label"),
        checked: deleteWithFiles,
        onConfirm: (checked) => removeTask(task, taskName, checked),
      })
    }
  }

  const confirmRecordDelete = (task: AriaTask, deleteWithFiles = false) => {
    const taskName = getTaskName(task)
    if (config?.noConfirmBeforeDeleteTask) void removeTaskRecord(task, taskName, deleteWithFiles)
    else {
      setConfirm({
        open: true,
        title: t("task.remove-record"),
        message: t("task.remove-record-confirm", { taskName }),
        checkbox: t("task.delete-task-label"),
        checked: deleteWithFiles,
        onConfirm: (checked) => removeTaskRecord(task, taskName, checked),
      })
    }
  }

  const batchDelete = (deleteWithFiles = false) => {
    if (!selectedGids.length) return
    const selected = taskList.filter((task) => selectedGids.includes(task.gid))
    setConfirm({
      open: true,
      title: t("task.delete-selected-tasks"),
      message: t("task.batch-delete-task-confirm", { count: selected.length }),
      checkbox: t("task.delete-task-label"),
      checked: deleteWithFiles,
      onConfirm: async (checked) => {
        try {
          await api.batch("aria2.forcePause", selected.map((task) => task.gid))
          if (checked) await Promise.allSettled(selected.map(removeFiles))
          await api.batch("aria2.remove", selected.map((task) => task.gid))
          await api.saveSession()
          await refreshTasks()
          toast.success("Successfully delete tasks in batch")
        } catch {
          toast.error("Failed to delete tasks in batch")
        }
      },
    })
  }

  const taskAction = async (action: string, task: AriaTask, event?: React.MouseEvent) => {
    const taskName = getTaskName(task)
    try {
      if (action === "pause") await api[checkTaskIsBT(task) ? "forcePauseTask" : "pauseTask"](task.gid)
      if (action === "resume") await api.resumeTask(task.gid)
      if (action === "stop-seeding") {
        await api.changeOption(task.gid, { seedTime: 0 })
        toast.info(t("task.bt-stopping-seeding-tip"))
      }
      if (action === "restart") {
        const uri = getTaskUri(task)
        const options = await api.getOption(task.gid)
        const payload = { dir: options.dir, header: options.header, split: options.split, out: taskName }
        if (task.status === TASK_STATUS.COMPLETE || event?.altKey) showAddTask(ADD_TASK_TYPE.URI, uri, payload)
        else {
          await api.addUri({ uris: [uri], options: payload })
          await api.removeTaskRecord(task.gid)
        }
      }
      if (action === "folder") await native.revealInFolder(getTaskFullPath(task))
      if (action === "link") {
        await native.writeClipboardText(getTaskUri(task))
        toast.success(t("task.copy-link-success"))
      }
      await refreshTasks()
      await api.saveSession()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  if (!ready || !config) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }

  return (
    <ThemeProvider attribute="class" forcedTheme={config.theme === APP_THEME.AUTO ? systemTheme() : config.theme} enableSystem={false}>
      <TooltipProvider>
        <div className="theme flex h-full flex-col overflow-hidden bg-background text-foreground">
          <TitleBar />
          <div className="flex min-h-0 flex-1">
            <Aside
              page={page}
              onNavigate={navigatePage}
              onAdd={() => showAddTask()}
              onAbout={() => setAboutVisible(true)}
            />
            {page === "task" ? (
              <TaskPage
                status={taskListStatus}
                setStatus={changeTaskListStatus}
                taskList={taskList}
                selectedGids={selectedGids}
                setSelectedGids={setSelectedGids}
                onRefresh={() => refreshTasks()}
                onBatchDelete={batchDelete}
                onAdd={() => showAddTask()}
                onPauseAll={async () => {
                  try {
                    await api.pauseAllTask()
                    toast.success(t("task.pause-all-task-success"))
                  } catch {
                    await api.forcePauseAllTask()
                  } finally {
                    await refreshTasks()
                  }
                }}
                onResumeAll={async () => {
                  try {
                    await api.resumeAllTask()
                    toast.success(t("task.resume-all-task-success"))
                  } catch {
                    toast.error(t("task.resume-all-task-fail"))
                  } finally {
                    await refreshTasks()
                  }
                }}
                onPurge={async () => {
                  try {
                    await api.purgeTaskRecord()
                    await refreshTasks()
                    toast.success(t("task.purge-record-success"))
                  } catch {
                    toast.error(t("task.purge-record-fail"))
                  }
                }}
                onShowDetail={showDetail}
                onAction={taskAction}
                onDelete={confirmTaskDelete}
                onDeleteRecord={confirmRecordDelete}
              />
            ) : (
              <PreferenceShell
                page={preferencePage}
                setPage={setPreferencePage}
                config={config}
                onSave={savePreference}
                onRefreshConfig={refreshConfig}
                onConfirm={setConfirm}
                onDirtyChange={setPreferenceDirty}
              />
            )}
            <Speedometer stat={stat} />
          </div>
          <AddTaskDialog
            state={addTask}
            config={config}
            onClose={closeAddTask}
            onSubmit={async (type, form) => {
              try {
                if (type === ADD_TASK_TYPE.URI) await api.addUri(buildUriPayload(form))
                else await api.addTorrent(buildTorrentPayload(form))
                closeAddTask()
                if (form.newTaskShowDownloading) {
                  setPage("task")
                  changeTaskListStatus("active")
                } else {
                  await refreshTasks()
                }
              } catch (error) {
                toast.error(t(error instanceof Error ? error.message : String(error)))
              }
            }}
            onRecordDirectory={async (dir) => {
              const historyDirectories = config.historyDirectories ?? []
              const favoriteDirectories = config.favoriteDirectories ?? []
              if ([...historyDirectories, ...favoriteDirectories].includes(dir)) return
              await savePreference({
                historyDirectories: pushItemToFixedLengthArray(historyDirectories, MAX_NUM_OF_DIRECTORIES, dir),
              })
            }}
          />
          <TaskDetailSheet
            detail={detail}
            setDetail={setDetail}
            onAction={taskAction}
            onDelete={confirmTaskDelete}
            onDeleteRecord={confirmRecordDelete}
          />
          <AboutDialog
            visible={aboutVisible}
            onClose={() => setAboutVisible(false)}
            engineInfo={engineInfo}
          />
          <ConfirmDialog state={confirm} setState={setConfirm} />
        </div>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  )
}

const systemTheme = () =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ? APP_THEME.DARK : APP_THEME.LIGHT

function TitleBar() {
  return (
    <div className="titlebar-overlay" data-tauri-drag-region />
  )
}

function Aside({
  page,
  onNavigate,
  onAdd,
  onAbout,
}: {
  page: Page
  onNavigate: (page: Page) => void
  onAdd: () => void
  onAbout: () => void
}) {
  return (
    <aside className="hidden w-[78px] shrink-0 bg-sidebar-primary text-sidebar-primary-foreground md:block">
      <div className="flex h-full flex-col items-center">
        <img src={logoMini} className="mt-8 h-8 w-8" alt="Motrix" draggable={false} data-tauri-drag-region />
        <div className="mt-8 flex flex-1 flex-col gap-5">
          <AsideButton active={page === "task"} label={t("app.task-list")} onClick={() => onNavigate("task")}>
            <ListChecks />
          </AsideButton>
          <AsideButton label={t("app.add-task")} onClick={onAdd}>
            <Plus />
          </AsideButton>
        </div>
        <div className="mb-6 flex flex-col gap-5">
          <AsideButton active={page === "preference"} label={t("app.preferences")} onClick={() => onNavigate("preference")}>
            <Settings />
          </AsideButton>
          <AsideButton label={t("app.about")} onClick={onAbout}>
            <Info />
          </AsideButton>
        </div>
      </div>
    </aside>
  )
}

function AsideButton({ active, label, children, onClick }: { active?: boolean; label: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn("rounded-full text-sidebar-primary-foreground hover:bg-sidebar-primary-foreground/15 hover:text-sidebar-primary-foreground", active && "bg-sidebar-primary-foreground/15")}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function Subnav({
  title,
  items,
}: {
  title: string
  items: SubnavItem[]
}) {
  return (
    <nav className="hidden w-[200px] shrink-0 border-r bg-muted/30 px-5 py-8 md:block">
      <h3 className="mb-6 text-lg font-medium">{title}</h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.key}>
            <Button
              variant={item.active ? "secondary" : "ghost"}
              className="h-10 w-full justify-start gap-3"
              onClick={item.onClick}
            >
              {item.icon}
              {item.title}
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function MobileSubnavSwitcher({ title, items }: { title: string; items: SubnavItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="-ml-2 h-auto gap-1 px-2 text-xl font-medium" />}>
        {title}
        <ChevronDown className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-44">
        {items.map((item) => (
          <DropdownMenuItem key={item.key} onClick={item.onClick}>
            <Check className={cn("size-4", !item.active && "opacity-0")} />
            {item.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PanelHeader({ title, actions, mobileNav }: { title: string; actions?: React.ReactNode; mobileNav?: React.ReactNode }) {
  return (
    <header className="relative flex h-[84px] shrink-0 items-end justify-between border-b px-6 pb-4">
      <div className="min-w-0">
        <h4 className={cn("truncate text-xl font-medium", mobileNav && "hidden md:block")}>{title}</h4>
        {mobileNav && <div className="md:hidden">{mobileNav}</div>}
      </div>
      {actions}
    </header>
  )
}

function TaskPage(props: {
  status: string
  setStatus: (status: string) => void
  taskList: AriaTask[]
  selectedGids: string[]
  setSelectedGids: (gids: string[]) => void
  onRefresh: () => void
  onBatchDelete: (deleteWithFiles?: boolean) => void
  onAdd: () => void
  onPauseAll: () => void
  onResumeAll: () => void
  onPurge: () => void
  onShowDetail: (task: AriaTask) => void
  onAction: (action: string, task: AriaTask, event?: React.MouseEvent) => void
  onDelete: (task: AriaTask, deleteWithFiles?: boolean) => void
  onDeleteRecord: (task: AriaTask, deleteWithFiles?: boolean) => void
}) {
  const subnav = [
    { key: "active", title: t("task.active"), icon: <Play />, active: props.status === "active", onClick: () => props.setStatus("active") },
    { key: "waiting", title: t("task.waiting"), icon: <Pause />, active: props.status === "waiting", onClick: () => props.setStatus("waiting") },
    { key: "stopped", title: t("task.stopped"), icon: <StopCircle />, active: props.status === "stopped", onClick: () => props.setStatus("stopped") },
  ]
  const title = subnav.find((item) => item.key === props.status)?.title ?? t("task.active")

  return (
    <main className="flex min-w-0 flex-1">
      <Subnav title={t("subnav.task-list")} items={subnav} />
      <section className="flex min-w-0 flex-1 flex-col bg-background">
        <PanelHeader
          title={title}
          mobileNav={<MobileSubnavSwitcher title={title} items={subnav} />}
          actions={
            <TaskActions
              status={props.status}
              selectedCount={props.selectedGids.length}
              onAdd={props.onAdd}
              onRefresh={props.onRefresh}
              onBatchDelete={props.onBatchDelete}
              onPauseAll={props.onPauseAll}
              onResumeAll={props.onResumeAll}
              onPurge={props.onPurge}
            />
          }
        />
        <ScrollArea className="min-h-0 flex-1">
          <TaskList {...props} />
        </ScrollArea>
      </section>
    </main>
  )
}

function TaskActions({
  status,
  selectedCount,
  onAdd,
  onRefresh,
  onBatchDelete,
  onPauseAll,
  onResumeAll,
  onPurge,
}: {
  status: string
  selectedCount: number
  onAdd: () => void
  onRefresh: () => void
  onBatchDelete: (deleteWithFiles?: boolean) => void
  onPauseAll: () => void
  onResumeAll: () => void
  onPurge: () => void
}) {
  const [refreshing, setRefreshing] = useState(false)
  const action = (label: string, icon: React.ReactNode, onClick: (event: React.MouseEvent) => void, disabled = false, className?: string) => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" disabled={disabled} onClick={onClick} className={className} />}>{icon}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
  return (
    <div className="flex items-center gap-1">
      {action(t("task.new-task"), <Plus />, onAdd, false, "md:hidden")}
      {status !== "stopped" && action(t("task.delete-selected-tasks"), <Trash />, (event) => onBatchDelete(event.shiftKey), selectedCount === 0)}
      {action(t("task.refresh-list"), <RefreshCw className={cn(refreshing && "animate-spin")} />, () => {
        setRefreshing(true)
        window.setTimeout(() => setRefreshing(false), 500)
        onRefresh()
      })}
      {action(t("task.resume-all-task"), <Play />, onResumeAll)}
      {action(t("task.pause-all-task"), <Pause />, onPauseAll)}
      {status === "stopped" && action(t("task.purge-record"), <SquareX />, onPurge)}
    </div>
  )
}

function TaskList(props: {
  taskList: AriaTask[]
  selectedGids: string[]
  setSelectedGids: (gids: string[]) => void
  onShowDetail: (task: AriaTask) => void
  onAction: (action: string, task: AriaTask, event?: React.MouseEvent) => void
  onDelete: (task: AriaTask, deleteWithFiles?: boolean) => void
  onDeleteRecord: (task: AriaTask, deleteWithFiles?: boolean) => void
}) {
  if (!props.taskList.length) {
    return (
      <div className="flex min-h-[520px] flex-col items-center justify-center gap-4">
        <img src={noTask} className="h-[320px] w-auto" alt="" draggable={false} />
        <p className="text-sm text-muted-foreground">{t("task.no-task")}</p>
      </div>
    )
  }

  const toggle = (gid: string) =>
    props.setSelectedGids(
      props.selectedGids.includes(gid)
        ? props.selectedGids.filter((item) => item !== gid)
        : [...props.selectedGids, gid],
    )

  return (
    <div className="space-y-4 p-4 pb-16">
      {props.taskList.map((task) => (
        <div key={task.gid} className={cn(props.selectedGids.includes(task.gid) && "rounded-lg ring-1 ring-primary")}>
          <TaskItem task={task} selected={props.selectedGids.includes(task.gid)} onSelect={() => toggle(task.gid)} {...props} />
        </div>
      ))}
    </div>
  )
}

function TaskItem({
  task,
  selected,
  onSelect,
  onShowDetail,
  onAction,
  onDelete,
  onDeleteRecord,
}: {
  task: AriaTask
  selected: boolean
  onSelect: () => void
  onShowDetail: (task: AriaTask) => void
  onAction: (action: string, task: AriaTask, event?: React.MouseEvent) => void
  onDelete: (task: AriaTask, deleteWithFiles?: boolean) => void
  onDeleteRecord: (task: AriaTask, deleteWithFiles?: boolean) => void
}) {
  const fullName = getTaskName(task, { defaultName: t("task.get-task-name"), maxLen: -1 })
  const status = taskStatus(task)
  return (
    <article
      className="relative min-h-[78px] rounded-lg border border-border bg-card px-3 py-4 hover:border-primary/60"
      onDoubleClick={() => {
        if (task.status === TASK_STATUS.COMPLETE) void native.openPath(getTaskFullPath(task))
        else if ([TASK_STATUS.WAITING, TASK_STATUS.PAUSED].includes(task.status as any)) void onAction("resume", task)
      }}
    >
      <div className="flex min-w-0 flex-row items-start gap-3 pr-48">
        <Checkbox checked={selected} onCheckedChange={onSelect} className="mt-1" />
        <div title={fullName} className="line-clamp-2 min-h-[26px] min-w-0 break-all leading-[26px] text-muted-foreground dark:text-foreground">
          {fullName}
        </div>
      </div>
      <div className="absolute right-3 top-4">
        <TaskItemActions
          task={task}
          mode="LIST"
          onAction={onAction}
          onDelete={onDelete}
          onDeleteRecord={onDeleteRecord}
          onShowDetail={onShowDetail}
        />
      </div>
      <div className="mt-5 pl-7">
        <TaskProgress task={task} status={status} />
        <TaskProgressInfo task={task} />
      </div>
    </article>
  )
}

function TaskProgress({ task, status }: { task: AriaTask; status?: string }) {
  const percent = calcProgress(task.totalLength, task.completedLength)
  return (
    <Progress value={percent} className="[&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-indicator]]:bg-[var(--task-progress-color)]" style={{ "--task-progress-color": statusColors[status ?? task.status] } as React.CSSProperties} />
  )
}

function TaskProgressInfo({ task }: { task: AriaTask }) {
  const isBT = checkTaskIsBT(task)
  const remaining = timeRemaining(task.totalLength, task.completedLength, task.downloadSpeed)
  return (
    <div className="mt-2 grid min-h-4 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 text-xs leading-4 text-muted-foreground">
      <div className="min-w-0 truncate">
        {(Number(task.completedLength) > 0 || Number(task.totalLength) > 0) && (
          <>
            <span>{bytesToSize(task.completedLength, 2)}</span>
            {Number(task.totalLength) > 0 && <span> / {bytesToSize(task.totalLength, 2)}</span>}
          </>
        )}
      </div>
      {task.status === TASK_STATUS.ACTIVE && (
        <div className="flex min-w-0 justify-end gap-3 whitespace-nowrap">
          {isBT && <MiniStat icon={<ArrowUp />} value={`${bytesToSize(task.uploadSpeed)}/s`} />}
          <MiniStat icon={<ArrowDown />} value={`${bytesToSize(task.downloadSpeed)}/s`} />
          {remaining > 0 && <span className="hidden md:inline">{timeFormat(remaining)}</span>}
          {isBT && <MiniStat className="hidden md:flex" icon={<Link />} value={task.numSeeders ?? "0"} />}
          <MiniStat className="hidden md:flex" icon={<Gauge />} value={task.connections} />
        </div>
      )}
    </div>
  )
}

function MiniStat({ icon, value, className }: { icon: React.ReactNode; value: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="[&_svg]:size-3">{icon}</span>
      {value}
    </span>
  )
}

function TaskItemActions({
  task,
  mode,
  onAction,
  onDelete,
  onDeleteRecord,
  onShowDetail,
}: {
  task: AriaTask
  mode: "LIST" | "DETAIL"
  onAction: (action: string, task: AriaTask, event?: React.MouseEvent) => void
  onDelete: (task: AriaTask, deleteWithFiles?: boolean) => void
  onDeleteRecord: (task: AriaTask, deleteWithFiles?: boolean) => void
  onShowDetail: (task: AriaTask) => void
}) {
  const status = taskStatus(task)
  const common = mode === "LIST" ? ["folder", "link", "info"] : ["folder", "link"]
  const map: Record<string, string[]> = {
    active: ["pause", "delete"],
    paused: ["resume", "delete"],
    waiting: ["resume", "delete"],
    error: ["restart", "trash"],
    complete: ["restart", "trash"],
    removed: ["restart", "trash"],
    seeding: ["stop-seeding", "delete"],
  }
  const actions = [...(map[status] ?? []), ...common].reverse()
  const render = (action: string) => {
    const icon = {
      pause: <Pause />,
      "stop-seeding": <StopCircle />,
      resume: <Play />,
      restart: <RotateCcw />,
      delete: <Trash />,
      trash: <Trash />,
      folder: <Folder />,
      link: <Link />,
      info: <Info />,
    }[action]
    const onClick = (event: React.MouseEvent) => {
      event.stopPropagation()
      if (action === "delete") onDelete(task, event.shiftKey)
      else if (action === "trash") onDeleteRecord(task, event.shiftKey)
      else if (action === "info") onShowDetail(task)
      else onAction(action, task, event)
    }
    return (
      <Button key={action} size="icon-xs" variant="ghost" className="size-6 rounded-full" onClick={onClick}>
        {icon}
      </Button>
    )
  }
  return (
    <ButtonGroup className="h-7 flex-row-reverse rounded-full border bg-background px-2 text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground">
      {actions.map(render)}
    </ButtonGroup>
  )
}

function Speedometer({ stat }: { stat: GlobalStat }) {
  return (
    <div className="fixed bottom-6 right-4 z-20 hidden rounded-full border bg-background/95 px-3 py-2 text-xs shadow-sm lg:flex">
      <MiniStat icon={<ArrowDown />} value={`${bytesToSize(stat.downloadSpeed)}/s`} />
      <Separator orientation="vertical" className="mx-2 h-4" />
      <MiniStat icon={<ArrowUp />} value={`${bytesToSize(stat.uploadSpeed)}/s`} />
    </div>
  )
}

function AddTaskDialog({
  state,
  config,
  onClose,
  onSubmit,
  onRecordDirectory,
}: {
  state: { visible: boolean; type: "uri" | "torrent"; url: string; options: Dict }
  config: PreferenceConfig
  onClose: () => void
  onSubmit: (type: "uri" | "torrent", form: Dict) => Promise<void>
  onRecordDirectory: (dir: string) => Promise<void>
}) {
  const [type, setType] = useState<"uri" | "torrent">(state.type)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [form, setForm] = useState<Dict>(() => initTaskForm(config, state.url, state.options))
  const fileInput = useRef<HTMLInputElement>(null)
  const uriInput = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!state.visible) return
    const nextForm = initTaskForm(config, state.url, state.options)
    setType(state.type)
    setShowAdvanced(false)
    setForm(nextForm)
    if (state.type === ADD_TASK_TYPE.URI) {
      window.setTimeout(() => uriInput.current?.focus(), 50)
      if (String(nextForm.uris ?? "").includes("thunder://")) toast.warning(t("task.thunder-link-tips"))
      native.readClipboardText().then((content) => {
        if (!detectResource(content)) return
        if (content.includes("thunder://")) toast.warning(t("task.thunder-link-tips"))
        setForm((current) => current.uris ? current : { ...current, uris: content })
      }).catch(() => undefined)
    }
  }, [state.visible])

  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }))
  const requestClose = () => {
    if (!String(form.uris ?? "") && !form.torrent) onClose()
  }

  const chooseDirectory = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const selected = await open({ directory: true, multiple: false })
    if (typeof selected === "string") {
      set("dir", selected)
      await onRecordDirectory(selected)
    }
  }

  useEffect(() => {
    if (!state.visible) return
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        void onSubmit(type, form)
      }
    }
    document.addEventListener("keydown", handleKeydown)
    return () => document.removeEventListener("keydown", handleKeydown)
  }, [form, onSubmit, state.visible, type])

  return (
    <Dialog open={state.visible} onOpenChange={(open) => !open && requestClose()}>
      <DialogContent showCloseButton={false} className={cn("top-[15vh] w-[67vw] min-w-[380px] max-w-[632px] translate-y-0 gap-0 p-0 sm:max-w-[632px]", showAdvanced && "top-[8vh]")}>
        <DialogTitle className="sr-only">{t("task.new-task")}</DialogTitle>
        <Button type="button" variant="ghost" size="icon-sm" className="absolute right-2 top-2" onClick={onClose}>
          <X />
          <span className="sr-only">Close</span>
        </Button>
        <div className="px-5 py-2.5">
          <Tabs value={type} onValueChange={setType}>
            <TabsList variant="line" className="w-full justify-start border-b p-0">
              <TabsTrigger value={ADD_TASK_TYPE.URI}>{t("task.uri-task")}</TabsTrigger>
              <TabsTrigger value={ADD_TASK_TYPE.TORRENT}>{t("task.torrent-task")}</TabsTrigger>
            </TabsList>
            <TabsContent value={ADD_TASK_TYPE.URI} className="mt-4">
              <Textarea
                ref={uriInput}
                value={String(form.uris ?? "")}
                onChange={(event) => set("uris", event.target.value)}
                onPaste={(event) => {
                  const target = event.currentTarget
                  window.setTimeout(() => {
                    if (target.value.includes("thunder://")) toast.warning(t("task.thunder-link-tips"))
                  }, 0)
                }}
                placeholder={t("task.uri-task-tips")}
                className="min-h-24"
              />
            </TabsContent>
            <TabsContent value={ADD_TASK_TYPE.TORRENT} className="mt-4">
              <SelectTorrent
                fileInput={fileInput}
                form={form}
                setForm={setForm}
              />
            </TabsContent>
          </Tabs>

          <div className="mt-4 grid gap-x-3 gap-y-3 sm:grid-cols-[minmax(0,15fr)_minmax(160px,9fr)]">
            <FormField label={t("task.task-out")} labelWidth="110px">
              <Input value={String(form.out ?? "")} placeholder={t("task.task-out-tips")} onChange={(event) => set("out", event.target.value)} />
            </FormField>
            <FormField label={t("task.task-split")} labelWidth="110px">
              <Input type="number" min={1} max={Number(config.engineMaxConnectionPerServer)} value={String(form.split ?? 1)} onChange={(event) => set("split", Number(event.target.value))} />
            </FormField>
          </div>
          <FormField label={t("task.task-dir")} labelWidth="110px" className="mt-3">
            <InputGroup>
              <DirectoryMenu config={config} onSelect={(dir) => set("dir", dir)} />
              <InputGroupInput value={String(form.dir ?? "")} onChange={(event) => set("dir", event.target.value)} />
              <InputGroupButton size="icon-sm" onClick={chooseDirectory}>
                <Folder />
              </InputGroupButton>
            </InputGroup>
          </FormField>

          {showAdvanced && (
            <div className="mt-4 space-y-3">
              <FormField label={t("task.task-user-agent")} labelWidth="110px">
                <Textarea rows={2} value={String(form.userAgent ?? "")} placeholder={t("task.task-user-agent")} onChange={(event) => set("userAgent", event.target.value)} />
              </FormField>
              <FormField label={t("task.task-authorization")} labelWidth="110px">
                <Textarea rows={2} value={String(form.authorization ?? "")} placeholder={t("task.task-authorization")} onChange={(event) => set("authorization", event.target.value)} />
              </FormField>
              <FormField label={t("task.task-referer")} labelWidth="110px">
                <Textarea rows={2} value={String(form.referer ?? "")} placeholder={t("task.task-referer")} onChange={(event) => set("referer", event.target.value)} />
              </FormField>
              <FormField label={t("task.task-cookie")} labelWidth="110px">
                <Textarea rows={2} value={String(form.cookie ?? "")} placeholder={t("task.task-cookie")} onChange={(event) => set("cookie", event.target.value)} />
              </FormField>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,16fr)_minmax(120px,8fr)]">
                <FormField label={t("task.task-proxy")} labelWidth="110px">
                  <Input value={String(form.allProxy ?? "")} placeholder={PROXY_PLACEHOLDER} onChange={(event) => set("allProxy", event.target.value)} />
                </FormField>
                <HelpLink className="pt-1.5" href="https://github.com/agalwood/Motrix/wiki/Proxy">
                  {t("preferences.proxy-tips")}
                </HelpLink>
              </div>
              <div className="grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)]">
                <div />
                <LabeledCheckbox checked={!!form.newTaskShowDownloading} onChange={(value) => set("newTaskShowDownloading", value)}>
                  {t("task.navigate-to-downloading")}
                </LabeledCheckbox>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 grid grid-cols-[minmax(0,9fr)_minmax(0,15fr)] items-center gap-3 rounded-b-xl border-t bg-muted/50 px-5 py-4 pt-5 sm:grid sm:justify-normal">
          <div className="min-w-0">
            <LabeledCheckbox checked={showAdvanced} onChange={setShowAdvanced}>
              {t("task.show-advanced-options")}
            </LabeledCheckbox>
          </div>
          <div className="flex min-w-0 justify-end gap-2">
            <Button variant="outline" onClick={onClose}>{t("app.cancel")}</Button>
            <Button onClick={() => onSubmit(type, form)}>{t("app.submit")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SelectTorrent({
  fileInput,
  form,
  setForm,
}: {
  fileInput: React.RefObject<HTMLInputElement | null>
  form: Dict
  setForm: React.Dispatch<React.SetStateAction<Dict>>
}) {
  const files = (form.torrentFiles ?? []) as AriaFile[]
  const selected = files.filter((file) => file.selected)

  const parseFile = async (file: File) => {
    const buffer = await file.arrayBuffer()
    const { default: parseTorrent } = await import("parse-torrent")
    const parsed = await parseTorrent(new Uint8Array(buffer))
    const nextFiles = listTorrentFiles(parsed.files ?? [])
    const base64 = arrayBufferToBase64(buffer)
    setForm((current) => ({
      ...current,
      torrent: base64,
      selectFile: SELECTED_ALL_FILES,
      torrentName: file.name,
      torrentFiles: nextFiles,
    }))
  }

  const setSelectedFiles = (next: AriaFile[]) =>
    setForm((current) => ({
      ...current,
      torrentFiles: next,
      selectFile: getFileSelection(next),
    }))

  if (!files.length) {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-auto w-full border-dashed p-8 text-muted-foreground hover:bg-muted/40"
        onClick={() => fileInput.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const file = event.dataTransfer.files[0]
          if (file) void parseFile(file)
        }}
      >
        <span className="flex flex-col items-center gap-3">
          <Upload className="size-6" />
          {t("task.select-torrent")}
        </span>
        <input
          ref={fileInput}
          className="hidden"
          type="file"
          accept=".torrent"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void parseFile(file)
          }}
        />
      </Button>
    )
  }

  const toggle = (idx: number) => {
    const next = files.map((file) => file.idx === idx ? { ...file, selected: !file.selected } : file)
    setSelectedFiles(next)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="truncate">{String(form.torrentName ?? "")}</span>
        <Button variant="ghost" size="icon-sm" onClick={() => setForm((current) => ({ ...current, torrent: "", torrentFiles: [], selectFile: NONE_SELECTED_FILES }))}>
          <Trash />
        </Button>
      </div>
      <TaskFilesTable files={files} mode="ADD" onToggle={toggle} onSelection={(next) => setSelectedFiles(next)} height={200} />
      <div className="mt-2 text-right text-sm text-muted-foreground">
        {t("task.selected-files-sum", {
          selectedFilesCount: selected.length,
          selectedFilesTotalSize: bytesToSize(selected.reduce((sum, file) => sum + Number(file.length), 0)),
        })}
      </div>
    </div>
  )
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = ""
  const bytes = new Uint8Array(buffer)
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function DirectoryMenu({ config, onSelect }: { config: PreferenceConfig; onSelect: (dir: string) => void }) {
  const all = [...(config.favoriteDirectories ?? []), ...(config.historyDirectories ?? [])]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<InputGroupButton size="icon-sm" />}>
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {all.length ? all.map((dir) => <DropdownMenuItem key={dir} onClick={() => onSelect(dir)}>{dir}</DropdownMenuItem>) : <DropdownMenuItem disabled>No history</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FormField({ label, children, className, labelWidth }: { label: string; children: React.ReactNode; className?: string; labelWidth?: string }) {
  if (labelWidth) {
    return (
      <div className={cn("grid items-start gap-2 sm:grid-cols-[var(--form-label-width)_minmax(0,1fr)]", className)} style={{ "--form-label-width": labelWidth } as React.CSSProperties}>
        <Label className="pt-1.5 text-right text-sm text-muted-foreground">{label}: </Label>
        <div className="min-w-0">{children}</div>
      </div>
    )
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function LabeledCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: React.ReactNode
}) {
  return (
    <label className="inline-flex min-w-0 cursor-pointer items-center gap-2 text-sm leading-7 text-foreground">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(!!value)} />
      <span>{children}</span>
    </label>
  )
}

function TaskDetailSheet({
  detail,
  setDetail,
  onAction,
  onDelete,
  onDeleteRecord,
}: {
  detail: { visible: boolean; gid: string; task: AriaTask | null; enabledPeers: boolean }
  setDetail: React.Dispatch<React.SetStateAction<{ visible: boolean; gid: string; task: AriaTask | null; enabledPeers: boolean }>>
  onAction: (action: string, task: AriaTask, event?: React.MouseEvent) => void
  onDelete: (task: AriaTask, deleteWithFiles?: boolean) => void
  onDeleteRecord: (task: AriaTask, deleteWithFiles?: boolean) => void
}) {
  const task = detail.task
  const [tab, setTab] = useState("general")
  const [fileSelection, setFileSelection] = useState("")
  const [optionsChanged, setOptionsChanged] = useState(false)
  useEffect(() => {
    if (!detail.visible) return
    setTab("general")
    setFileSelection("")
    setOptionsChanged(false)
  }, [detail.gid, detail.visible])
  const files = useMemo(() => {
    if (!task) return []
    return (task.files ?? []).map((item) => {
      const name = getFileName(item.path)
      return {
        idx: Number(item.index),
        selected: item.selected === "true" || item.selected === true,
        path: item.path,
        name,
        extension: `.${getFileExtension(name)}`,
        length: Number(item.length),
        completedLength: Number(item.completedLength ?? 0),
      }
    })
  }, [task])

  const selectFiles = (next: AriaFile[]) => {
    const selection = getFileSelection(next)
    setFileSelection(selection)
    setOptionsChanged(true)
  }

  return (
    <Sheet open={detail.visible} onOpenChange={(open) => !open && setDetail({ visible: false, gid: "", task: null, enabledPeers: false })}>
      <SheetContent side="right" className="w-[61.8%] min-w-[478px] max-w-none gap-0 p-0">
        <SheetHeader className="border-b px-5 py-6">
          <SheetTitle>{t("task.task-detail-title")}</SheetTitle>
        </SheetHeader>
        {task && (
          <>
            <Tabs value={tab} onValueChange={(next) => {
              setTab(next)
              setOptionsChanged(false)
              setDetail((current) => ({ ...current, enabledPeers: next === "peers" }))
            }} className="min-h-0 flex-1 p-5">
              <TabsList variant="line">
                <TabsTrigger value="general"><Info /></TabsTrigger>
                <TabsTrigger value="activity"><Gauge /></TabsTrigger>
                {checkTaskIsBT(task) && <TabsTrigger value="trackers"><Link /></TabsTrigger>}
                {checkTaskIsBT(task) && <TabsTrigger value="peers"><Upload /></TabsTrigger>}
                <TabsTrigger value="files"><File /></TabsTrigger>
              </TabsList>
              <ScrollArea className="mt-4 h-[calc(100vh-220px)]">
                <TabsContent value="general"><TaskGeneral task={task} /></TabsContent>
                <TabsContent value="activity"><TaskActivity task={task} /></TabsContent>
                <TabsContent value="trackers"><TaskTrackers task={task} /></TabsContent>
                <TabsContent value="peers"><TaskPeers peers={task.peers ?? []} /></TabsContent>
                <TabsContent value="files">
                  <TaskFilesTable files={files} mode="DETAIL" onSelection={selectFiles} />
                </TabsContent>
              </ScrollArea>
            </Tabs>
            <SheetFooter className="sticky bottom-0 flex-row items-center justify-between border-t bg-background">
              <div>
                {optionsChanged && <Button variant="outline" onClick={() => setOptionsChanged(false)}>{t("app.reset")}</Button>}
              </div>
              <TaskItemActions
                task={task}
                mode="DETAIL"
                onAction={onAction}
                onDelete={onDelete}
                onDeleteRecord={onDeleteRecord}
                onShowDetail={() => undefined}
              />
              <div>
                {optionsChanged && (
                  <Button
                    onClick={async () => {
                      if (fileSelection === NONE_SELECTED_FILES) {
                        toast.warning(t("task.select-at-least-one"))
                        return
                      }
                      await api.changeOption(task.gid, { selectFile: fileSelection !== SELECTED_ALL_FILES ? fileSelection : "" })
                      setOptionsChanged(false)
                    }}
                  >
                    {t("app.save")}
                  </Button>
                )}
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function StaticField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 py-2 text-sm">
      <div className="justify-end text-right text-muted-foreground">{label}:</div>
      <div className="min-w-0 break-all">{children}</div>
    </div>
  )
}

function TaskGeneral({ task }: { task: AriaTask }) {
  return (
    <div className="space-y-1">
      <StaticField label={t("task.task-gid")}>{task.gid}</StaticField>
      <StaticField label={t("task.task-name")}>{getTaskName(task, { defaultName: t("task.get-task-name"), maxLen: -1 })}</StaticField>
      <StaticField label={t("task.task-dir")}>
        <div className="flex min-w-0 items-center gap-2">
          <Input readOnly value={getTaskFullPath(task)} className="min-w-0 flex-1" />
          <Button variant="outline" size="icon-sm" onClick={() => native.revealInFolder(getTaskFullPath(task))}><Folder /></Button>
        </div>
      </StaticField>
      <StaticField label={t("task.task-status")}><TaskStatus status={taskStatus(task)} /></StaticField>
      {task.errorCode && task.errorCode !== "0" && <StaticField label={t("task.task-error-info")}>{task.errorCode} {task.errorMessage}</StaticField>}
      {checkTaskIsBT(task) && (
        <>
          <Separator className="my-4" />
          <div className="py-2 text-center text-sm text-muted-foreground">{t("task.task-bittorrent-info")}</div>
          <StaticField label={t("task.task-info-hash")}>
            {task.infoHash}
            <Button variant="ghost" size="icon-xs" onClick={() => native.writeClipboardText(getTaskUri(task)).then(() => toast.success(t("task.copy-link-success")))}><Link /></Button>
          </StaticField>
          <StaticField label={t("task.task-piece-length")}>{bytesToSize(task.pieceLength ?? 0)}</StaticField>
          <StaticField label={t("task.task-num-pieces")}>{task.numPieces}</StaticField>
          <StaticField label={t("task.task-bittorrent-creation-date")}>{task.bittorrent?.creationDate ? new Date(task.bittorrent.creationDate * 1000).toLocaleString() : ""}</StaticField>
          <StaticField label={t("task.task-bittorrent-comment")}>{task.bittorrent?.comment}</StaticField>
        </>
      )}
    </div>
  )
}

function TaskStatus({ status }: { status: string }) {
  return <Badge variant="outline" style={{ borderColor: statusColors[status], color: statusColors[status] }}>{status}</Badge>
}

function TaskActivity({ task }: { task: AriaTask }) {
  const status = taskStatus(task)
  const percent = calcProgress(task.totalLength, task.completedLength)
  return (
    <div>
      <TaskGraphic bitfield={task.bitfield ?? ""} />
      <StaticField label={t("task.task-progress-info")}>
        <div className="grid grid-cols-[1fr_60px] gap-3">
          <TaskProgress task={task} status={status} />
          <span>{percent}%</span>
        </div>
      </StaticField>
      <StaticField label="">
        {bytesToSize(task.completedLength, 2)}
        {Number(task.totalLength) > 0 && ` / ${bytesToSize(task.totalLength, 2)}`}
        {status === TASK_STATUS.ACTIVE && <span className="ml-4">{timeFormat(timeRemaining(task.totalLength, task.completedLength, task.downloadSpeed))}</span>}
      </StaticField>
      {checkTaskIsBT(task) && <StaticField label={t("task.task-num-seeders")}>{task.numSeeders}</StaticField>}
      <StaticField label={t("task.task-connections")}>{task.connections}</StaticField>
      <StaticField label={t("task.task-download-speed")}>{bytesToSize(task.downloadSpeed)}/s</StaticField>
      {checkTaskIsBT(task) && <StaticField label={t("task.task-upload-speed")}>{bytesToSize(task.uploadSpeed)}/s</StaticField>}
      {checkTaskIsBT(task) && <StaticField label={t("task.task-upload-length")}>{bytesToSize(task.uploadLength ?? 0)}</StaticField>}
      {checkTaskIsBT(task) && <StaticField label={t("task.task-ratio")}>{calcRatio(task.totalLength, task.uploadLength ?? 0)}</StaticField>}
    </div>
  )
}

function TaskGraphic({ bitfield }: { bitfield: string }) {
  const atomWidth = 10
  const atomHeight = 10
  const atomGutter = 3
  const outerWidth = 420
  const atomWG = atomWidth + atomGutter
  const atomHG = atomHeight + atomGutter
  const columnCount = Math.max(1, Math.floor((outerWidth - atomWidth) / atomWG) + 1)
  const rowCount = Math.floor(bitfield.length / columnCount) + 1
  const width = atomWG * (columnCount - 1) + atomWidth
  const height = atomHG * (rowCount - 1) + atomHeight
  const colors = ["#dcdfe6", "#b3d8ff", "#79bbff", "#67c23a"]
  return (
    <svg className="mb-6 max-w-full" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {bitfield.split("").map((char, index) => {
        const x = (index % columnCount) * atomWG
        const y = Math.floor(index / columnCount) * atomHG
        return <rect key={index} x={x} y={y} width={atomWidth} height={atomHeight} rx={2} fill={colors[Math.floor(Number.parseInt(char, 16) / 4)]} />
      })}
    </svg>
  )
}

function TaskTrackers({ task }: { task: AriaTask }) {
  const trackers = (task.bittorrent?.announceList ?? []).map((i) => i[0]).join("\n")
  return <Textarea readOnly value={trackers} className="min-h-80 leading-7" />
}

function TaskPeers({ peers }: { peers: Peer[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("task.task-peer-host")}</TableHead>
          <TableHead>{t("task.task-peer-client")}</TableHead>
          <TableHead className="text-right">%</TableHead>
          <TableHead className="text-right">↑</TableHead>
          <TableHead className="text-right">↓</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {peers.map((peer, index) => (
          <TableRow key={`${peer.ip}-${peer.port}-${index}`}>
            <TableCell>{peer.ip}:{peer.port}</TableCell>
            <TableCell>{peerIdParser(peer.peerId)}</TableCell>
            <TableCell className="text-right">{bitfieldToPercent(peer.bitfield)}%</TableCell>
            <TableCell className="text-right">{bytesToSize(peer.uploadSpeed)}/s</TableCell>
            <TableCell className="text-right">{bytesToSize(peer.downloadSpeed)}/s</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function TaskFilesTable({
  files,
  mode,
  onToggle,
  onSelection,
  height,
}: {
  files: AriaFile[]
  mode: "ADD" | "DETAIL"
  onToggle?: (idx: number) => void
  onSelection?: (files: AriaFile[]) => void
  height?: number
}) {
  const [current, setCurrent] = useState(files)
  useEffect(() => setCurrent(files), [files])
  const select = (next: AriaFile[]) => {
    setCurrent(next)
    onSelection?.(next)
  }
  const toggle = (idx: number) => {
    if (onToggle) onToggle(idx)
    else select(current.map((file) => file.idx === idx ? { ...file, selected: !file.selected } : file))
  }
  const quick = (filtered: AriaFile[]) => select(current.map((file) => ({ ...file, selected: filtered.some((item) => item.idx === file.idx) })))
  const selected = current.filter((file) => file.selected)
  return (
    <div>
      <div style={{ maxHeight: height }} className={cn(height && "overflow-auto")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>{t("task.file-name")}</TableHead>
              <TableHead className="w-24">{t("task.file-extension")}</TableHead>
              {mode === "DETAIL" && <TableHead className="w-16 text-right">%</TableHead>}
              {mode === "DETAIL" && <TableHead className="w-24 text-right">✓</TableHead>}
              <TableHead className="w-24 text-right">{t("task.file-size")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {current.map((file) => (
              <TableRow key={file.idx} onDoubleClick={() => toggle(Number(file.idx))}>
                <TableCell><Checkbox checked={!!file.selected} onCheckedChange={() => toggle(Number(file.idx))} /></TableCell>
                <TableCell className="max-w-80 truncate">{file.name ?? getFileName(file.path)}</TableCell>
                <TableCell>{removeExtensionDot(file.extension ?? "")}</TableCell>
                {mode === "DETAIL" && <TableCell className="text-right">{calcProgress(file.length, file.completedLength ?? 0, 1)}</TableCell>}
                {mode === "DETAIL" && <TableCell className="text-right">{bytesToSize(file.completedLength ?? 0)}</TableCell>}
                <TableCell className="text-right">{bytesToSize(file.length)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => quick(filterVideoFiles(current))}><FileVideo /></Button>
          <Button variant="outline" size="icon-sm" onClick={() => quick(filterAudioFiles(current))}><FileAudio /></Button>
          <Button variant="outline" size="icon-sm" onClick={() => quick(filterImageFiles(current))}><FileImage /></Button>
          <Button variant="outline" size="icon-sm" onClick={() => quick(filterDocumentFiles(current))}><FileText /></Button>
        </div>
        <div className="text-sm text-muted-foreground">
          {t("task.selected-files-sum", {
            selectedFilesCount: selected.length,
            selectedFilesTotalSize: bytesToSize(selected.reduce((sum, file) => sum + Number(file.length), 0)),
          })}
        </div>
      </div>
    </div>
  )
}

function PreferenceShell({
  page,
  setPage,
  config,
  onSave,
  onRefreshConfig,
  onConfirm,
  onDirtyChange,
}: {
  page: PreferencePage
  setPage: (page: PreferencePage) => void
  config: PreferenceConfig
  onSave: (changed: Dict) => Promise<void>
  onRefreshConfig: () => Promise<PreferenceConfig>
  onConfirm: React.Dispatch<React.SetStateAction<ConfirmState>>
  onDirtyChange: (dirty: boolean) => void
}) {
  const subnav = [
    { key: "basic", title: t("preferences.basic"), icon: <Settings />, active: page === "basic", onClick: () => setPage("basic") },
    { key: "advanced", title: t("preferences.advanced"), icon: <Gauge />, active: page === "advanced", onClick: () => setPage("advanced") },
    { key: "lab", title: t("preferences.lab"), icon: <CircleAlert />, active: page === "lab", onClick: () => setPage("lab") },
  ]
  const [dirtyMap, setDirtyMap] = useState<Record<PreferencePage, boolean>>({ basic: false, advanced: false, lab: false })
  const markDirty = useCallback((key: PreferencePage, dirty: boolean) => {
    setDirtyMap((current) => current[key] === dirty ? current : { ...current, [key]: dirty })
  }, [])
  useEffect(() => {
    onDirtyChange(Object.values(dirtyMap).some(Boolean))
  }, [dirtyMap, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  return (
    <main className="flex min-w-0 flex-1">
      <Subnav title={t("subnav.preferences")} items={subnav} />
      <PreferenceBasic active={page === "basic"} navItems={subnav} config={config} onSave={onSave} onRefreshConfig={onRefreshConfig} onDirtyChange={markDirty} />
      <PreferenceAdvanced active={page === "advanced"} navItems={subnav} config={config} onSave={onSave} onRefreshConfig={onRefreshConfig} onConfirm={onConfirm} onDirtyChange={markDirty} />
      <PreferenceLab active={page === "lab"} navItems={subnav} config={config} />
    </main>
  )
}

function PreferenceFrame({ title, children, active = true, navItems }: { title: string; children: React.ReactNode; active?: boolean; navItems?: SubnavItem[] }) {
  return (
    <section className={cn("min-w-0 flex-1 flex-col", active ? "flex" : "hidden")}>
      <PanelHeader title={title} mobileNav={navItems && <MobileSubnavSwitcher title={title} items={navItems} />} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="py-4 pl-4 pr-[7%] sm:pl-9">{children}</div>
      </ScrollArea>
    </section>
  )
}

function PreferenceBasic({
  active,
  navItems,
  config,
  onSave,
  onRefreshConfig,
  onDirtyChange,
}: {
  active: boolean
  navItems: SubnavItem[]
  config: PreferenceConfig
  onSave: (changed: Dict) => Promise<void>
  onRefreshConfig: () => Promise<PreferenceConfig>
  onDirtyChange: (key: PreferencePage, dirty: boolean) => void
}) {
  const [form, setForm] = useState<Dict>(() => basicForm(config))
  const [original, setOriginal] = useState<Dict>(() => basicForm(config))
  useEffect(() => {
    setForm(basicForm(config))
    setOriginal(basicForm(config))
  }, [config])
  useEffect(() => {
    onDirtyChange("basic", Object.keys(diffConfig(original, form)).length > 0)
  }, [form, original, onDirtyChange])
  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }))
  const save = async () => {
    const data = diffConfig(original, form)
    if ("btAutoDownloadContent" in data) {
      data.followTorrent = data.btAutoDownloadContent
      data.followMetalink = data.btAutoDownloadContent
      data.pauseMetadata = !data.btAutoDownloadContent
      delete data.btAutoDownloadContent
    }
    await onSave(data)
    const next = await onRefreshConfig()
    setForm(basicForm(next))
    setOriginal(basicForm(next))
  }

  const chooseDirectory = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const selected = await open({ directory: true, multiple: false })
    if (typeof selected === "string") set("dir", selected)
  }

  const speedUnits = [{ label: "KB/s", value: "K" }, { label: "MB/s", value: "M" }]
  return (
    <PreferenceFrame title={t("preferences.basic")} active={active} navItems={navItems}>
      <div className="space-y-8 pb-24">
        <PreferenceGroup label={t("preferences.appearance")}>
          <PreferenceSubRow><ThemeSwitcher value={String(form.theme)} onChange={(value) => set("theme", value)} /></PreferenceSubRow>
          <CheckRow show={isWindowsOrLinux()} width="span-16" checked={!!form.hideAppMenu} onChange={(value) => set("hideAppMenu", value)}>{t("preferences.hide-app-menu")}</CheckRow>
          <CheckRow width="span-16" checked={!!form.autoHideWindow} onChange={(value) => set("autoHideWindow", value)}>{t("preferences.auto-hide-window")}</CheckRow>
          <CheckRow show={isMac()} width="span-16" checked={!!form.traySpeedometer} onChange={(value) => set("traySpeedometer", value)}>{t("preferences.tray-speedometer")}</CheckRow>
          <CheckRow width="span-16" checked={!!form.showProgressBar} onChange={(value) => set("showProgressBar", value)}>{t("preferences.show-progress-bar")}</CheckRow>
        </PreferenceGroup>
        {isMac() && (
          <PreferenceGroup label={t("preferences.run-mode")}>
            <PreferenceSubRow>
              <SelectBox value={String(form.runMode)} onChange={(value) => set("runMode", Number(value))} items={[
                { label: t("preferences.run-mode-standard"), value: APP_RUN_MODE.STANDARD },
                { label: t("preferences.run-mode-tray"), value: APP_RUN_MODE.TRAY },
                { label: t("preferences.run-mode-hide-tray"), value: APP_RUN_MODE.HIDE_TRAY },
              ]} />
            </PreferenceSubRow>
          </PreferenceGroup>
        )}
        <PreferenceGroup label={t("preferences.language")}>
          <PreferenceSubRow width="span-16"><SelectBox value={String(form.locale)} onChange={(value) => set("locale", value)} items={availableLanguages} className="w-full" /></PreferenceSubRow>
        </PreferenceGroup>
        <PreferenceGroup label={t("preferences.startup")}>
          <CheckRow show={!isLinux()} checked={!!form.openAtLogin} onChange={(value) => set("openAtLogin", value)}>{t("preferences.open-at-login")}</CheckRow>
          <CheckRow checked={!!form.keepWindowState} onChange={(value) => set("keepWindowState", value)}>{t("preferences.keep-window-state")}</CheckRow>
          <CheckRow checked={!!form.resumeAllWhenAppLaunched} onChange={(value) => set("resumeAllWhenAppLaunched", value)}>{t("preferences.auto-resume-all")}</CheckRow>
        </PreferenceGroup>
        <PreferenceGroup label={t("preferences.default-dir")}>
          <PreferenceSubRow className="flex items-center gap-2">
            <DirectoryMenu config={config} onSelect={(dir) => set("dir", dir)} />
            <Input value={String(form.dir ?? "")} onChange={(event) => set("dir", event.target.value)} className="min-w-0 flex-1" />
            <Button variant="outline" size="icon-sm" onClick={chooseDirectory}><Folder /></Button>
          </PreferenceSubRow>
        </PreferenceGroup>
        <PreferenceGroup label={t("preferences.transfer-settings")}>
          <SpeedLimitRow label={t("preferences.transfer-speed-upload")} value={form.maxOverallUploadLimit} unit={extractSpeedUnit(form.maxOverallUploadLimit as any)} units={speedUnits} onChange={(value) => set("maxOverallUploadLimit", value)} />
          <SpeedLimitRow label={t("preferences.transfer-speed-download")} value={form.maxOverallDownloadLimit} unit={extractSpeedUnit(form.maxOverallDownloadLimit as any)} units={speedUnits} onChange={(value) => set("maxOverallDownloadLimit", value)} />
        </PreferenceGroup>
        <PreferenceGroup label={t("preferences.bt-settings")}>
          <CheckRow checked={!!form.btSaveMetadata} onChange={(value) => set("btSaveMetadata", value)}>{t("preferences.bt-save-metadata")}</CheckRow>
          <CheckRow checked={!!form.btAutoDownloadContent} onChange={(value) => set("btAutoDownloadContent", value)}>{t("preferences.bt-auto-download-content")}</CheckRow>
          <CheckRow checked={!!form.btForceEncryption} onChange={(value) => set("btForceEncryption", value)}>{t("preferences.bt-force-encryption")}</CheckRow>
          <SwitchRow checked={!!form.keepSeeding} onChange={(value) => {
            setForm((current) => ({ ...current, keepSeeding: value, seedRatio: value ? 0 : 1, seedTime: value ? 525600 : 60 }))
          }}>{t("preferences.keep-seeding")}</SwitchRow>
          {!form.keepSeeding && <NumberRow label={t("preferences.seed-ratio")} value={Number(form.seedRatio)} min={1} max={100} step={0.1} onChange={(value) => set("seedRatio", value)} />}
          {!form.keepSeeding && <NumberRow label={`${t("preferences.seed-time")} (${t("preferences.seed-time-unit")})`} value={Number(form.seedTime)} min={60} max={525600} onChange={(value) => set("seedTime", value)} />}
        </PreferenceGroup>
        <PreferenceGroup label={t("preferences.task-manage")}>
          <NumberRow label={t("preferences.max-concurrent-downloads")} value={Number(form.maxConcurrentDownloads)} min={1} max={ENGINE_MAX_CONCURRENT_DOWNLOADS} onChange={(value) => set("maxConcurrentDownloads", value)} />
          <NumberRow label={t("preferences.max-connection-per-server")} value={Number(form.maxConnectionPerServer)} min={1} max={Number(form.engineMaxConnectionPerServer)} onChange={(value) => set("maxConnectionPerServer", value)} />
          <CheckRow checked={!!form.continue} onChange={(value) => set("continue", value)}>{t("preferences.continue")}</CheckRow>
          <CheckRow checked={!!form.newTaskShowDownloading} onChange={(value) => set("newTaskShowDownloading", value)}>{t("preferences.new-task-show-downloading")}</CheckRow>
          <CheckRow checked={!!form.taskNotification} onChange={(value) => set("taskNotification", value)}>{t("preferences.task-completed-notify")}</CheckRow>
          <CheckRow checked={!!form.noConfirmBeforeDeleteTask} onChange={(value) => set("noConfirmBeforeDeleteTask", value)}>{t("preferences.no-confirm-before-delete-task")}</CheckRow>
        </PreferenceGroup>
      </div>
      <PreferenceActions onSave={save} onReset={() => setForm(original)} />
    </PreferenceFrame>
  )
}

const basicForm = (config: PreferenceConfig) => ({
  autoHideWindow: config.autoHideWindow,
  btAutoDownloadContent: config.followTorrent && config.followMetalink && !config.pauseMetadata,
  btForceEncryption: config.btForceEncryption,
  btSaveMetadata: config.btSaveMetadata,
  continue: config.continue,
  dir: config.dir,
  engineMaxConnectionPerServer: config.engineMaxConnectionPerServer,
  hideAppMenu: config.hideAppMenu,
  keepSeeding: config.keepSeeding,
  keepWindowState: config.keepWindowState,
  locale: config.locale,
  maxConcurrentDownloads: config.maxConcurrentDownloads,
  maxConnectionPerServer: config.maxConnectionPerServer,
  maxOverallDownloadLimit: config.maxOverallDownloadLimit,
  maxOverallUploadLimit: config.maxOverallUploadLimit,
  newTaskShowDownloading: config.newTaskShowDownloading,
  noConfirmBeforeDeleteTask: config.noConfirmBeforeDeleteTask,
  openAtLogin: config.openAtLogin,
  resumeAllWhenAppLaunched: config.resumeAllWhenAppLaunched,
  runMode: config.runMode,
  seedRatio: config.seedRatio,
  seedTime: config.seedTime,
  showProgressBar: config.showProgressBar,
  taskNotification: config.taskNotification,
  theme: config.theme,
  traySpeedometer: config.traySpeedometer,
})

function PreferenceAdvanced({
  active,
  navItems,
  config,
  onSave,
  onRefreshConfig,
  onConfirm,
  onDirtyChange,
}: {
  active: boolean
  navItems: SubnavItem[]
  config: PreferenceConfig
  onSave: (changed: Dict) => Promise<void>
  onRefreshConfig: () => Promise<PreferenceConfig>
  onConfirm: React.Dispatch<React.SetStateAction<ConfirmState>>
  onDirtyChange: (key: PreferencePage, dirty: boolean) => void
}) {
  const [form, setForm] = useState<Dict>(() => advancedForm(config))
  const [original, setOriginal] = useState<Dict>(() => advancedForm(config))
  const [syncing, setSyncing] = useState(false)
  useEffect(() => {
    setForm(advancedForm(config))
    setOriginal(advancedForm(config))
  }, [config])
  useEffect(() => {
    onDirtyChange("advanced", Object.keys(diffConfig(original, form)).length > 0)
  }, [form, original, onDirtyChange])
  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }))
  const save = async () => {
    const data = diffConfig(original, form)
    if ("btTracker" in data) data.btTracker = reduceTrackerString(convertLineToComma(String(data.btTracker)))
    if (data.rpcListenPort === "") data.rpcListenPort = ENGINE_RPC_PORT
    await onSave(data)
    const next = await onRefreshConfig()
    setForm(advancedForm(next))
    setOriginal(advancedForm(next))
  }
  const checkForUpdates = async () => {
    toast.info(t("app.checking-for-updates"))
    await native.saveConfig({ lastCheckUpdateTime: Date.now() })
    const next = await onRefreshConfig()
    set("lastCheckUpdateTime", next.lastCheckUpdateTime)
  }
  const syncTrackers = async () => {
    setSyncing(true)
    try {
      const sources = (form.trackerSource ?? []) as string[]
      const now = Date.now()
      const chunks = await Promise.all(sources.map((url) => native.fetchText(`${url}?t=${now}`, form.proxy as Dict)))
      set("btTracker", chunks.join("\n").trim())
      set("lastSyncTrackerTime", Date.now())
    } finally {
      setSyncing(false)
    }
  }
  const proxy = form.proxy as any
  const protocols = form.protocols as any
  return (
    <PreferenceFrame title={t("preferences.advanced")} active={active} navItems={navItems}>
      <div className="space-y-8 pb-24">
        <PreferenceGroup label={t("preferences.auto-update")}>
          <CheckRow checked={!!form.autoCheckUpdate} onChange={(value) => set("autoCheckUpdate", value)}>{t("preferences.auto-check-update")}</CheckRow>
          {!!form.lastCheckUpdateTime && (
            <PreferenceSubRow className="text-sm text-muted-foreground">
              {t("preferences.last-check-update-time")}: {new Date(Number(form.lastCheckUpdateTime)).toLocaleString()}
              <button type="button" className="ml-2 text-foreground underline-offset-4 hover:underline" onClick={checkForUpdates}>
                {t("app.check-updates-now")}
              </button>
            </PreferenceSubRow>
          )}
        </PreferenceGroup>
        <PreferenceGroup label={t("preferences.proxy")}>
          <SwitchRow checked={!!proxy.enable} onChange={(value) => set("proxy", { ...proxy, enable: value })}>{t("preferences.enable-proxy")}</SwitchRow>
        </PreferenceGroup>
        {proxy.enable && (
          <PreferenceGroup label="" className="-mt-4">
            <div className="space-y-2">
              <PreferenceSubRow width="proxy-server">
                <Input value={proxy.server} placeholder={PROXY_PLACEHOLDER} onChange={(event) => set("proxy", { ...proxy, server: event.target.value })} />
              </PreferenceSubRow>
              <PreferenceSubRow width="proxy-wide">
                <Textarea rows={2} value={String(proxy.bypass ?? "").split(",").join("\n")} placeholder={t("preferences.proxy-bypass-input-tips")} onChange={(event) => set("proxy", { ...proxy, bypass: convertLineToComma(event.target.value) })} />
              </PreferenceSubRow>
              <PreferenceSubRow width="proxy-wide">
                <MultiSelect values={proxy.scope ?? []} options={PROXY_SCOPE_OPTIONS.map((item) => ({ value: item, label: t(`preferences.proxy-scope-${item}`) }))} onChange={(scope) => set("proxy", { ...proxy, scope })} />
                <HelpLink className="mt-2" href="https://github.com/agalwood/Motrix/wiki/Proxy">
                  {t("preferences.proxy-tips")}
                </HelpLink>
              </PreferenceSubRow>
            </div>
          </PreferenceGroup>
        )}
        <PreferenceGroup label={t("preferences.bt-tracker")}>
          <div className="space-y-2">
            <PreferenceSubRow width="span-24" className="space-y-3">
              <div className="grid grid-cols-[minmax(0,20fr)_minmax(36px,3fr)] gap-2">
                <div className="min-w-0">
                  <MultiSelect
                    values={(form.trackerSource ?? []) as string[]}
                    options={TRACKER_SOURCE_OPTIONS.flatMap((group) => group.options.map((item) => ({ value: String(item.value), label: `${item.label}${item.cdn ? " CDN" : ""}` })))}
                    onChange={(trackerSource) => set("trackerSource", trackerSource)}
                  />
                </div>
                <Button variant="outline" size="icon-sm" onClick={syncTrackers}>{syncing ? <Spinner /> : <RefreshCw />}</Button>
              </div>
              <Textarea rows={3} value={String(form.btTracker ?? "")} placeholder={t("preferences.bt-tracker-input-tips")} onChange={(event) => set("btTracker", event.target.value)} />
              <div className="text-sm text-muted-foreground">
                {t("preferences.bt-tracker-tips")}
                <HelpLink href="https://github.com/ngosang/trackerslist" inline>ngosang/trackerslist</HelpLink>
                <HelpLink className="ml-2" href="https://github.com/XIU2/TrackersListCollection" inline>XIU2/TrackersListCollection</HelpLink>
              </div>
            </PreferenceSubRow>
            <CheckRow checked={!!form.autoSyncTracker} onChange={(value) => set("autoSyncTracker", value)}>{t("preferences.auto-sync-tracker")}</CheckRow>
            {!!form.lastSyncTrackerTime && <PreferenceSubRow className="text-sm text-muted-foreground">{new Date(Number(form.lastSyncTrackerTime)).toLocaleString()}</PreferenceSubRow>}
          </div>
        </PreferenceGroup>
        <PreferenceGroup label={t("preferences.rpc")}>
          <PreferenceSubRow width="md-10">
            <InputWithDice label={t("preferences.rpc-listen-port")} value={String(form.rpcListenPort ?? "")} placeholder={String(ENGINE_RPC_PORT)} maxLength={8} onChange={(value) => set("rpcListenPort", value === "" ? ENGINE_RPC_PORT : value)} onDice={() => set("rpcListenPort", randomPort(ENGINE_RPC_PORT, 20000))} />
          </PreferenceSubRow>
          <PreferenceSubRow width="md-18">
            <InputWithDice label={t("preferences.rpc-secret")} value={String(form.rpcSecret ?? "")} placeholder="RPC Secret" maxLength={64} onChange={(value) => set("rpcSecret", value)} onDice={async () => set("rpcSecret", await native.randomSecret())} />
            <HelpLink className="mt-2" href="https://github.com/agalwood/Motrix/wiki/RPC">
              {t("preferences.rpc-secret-tips")}
            </HelpLink>
          </PreferenceSubRow>
        </PreferenceGroup>
        <PreferenceGroup label={t("preferences.port")}>
          <SwitchRow checked={!!form.enableUpnp} onChange={(value) => set("enableUpnp", value)}>UPnP/NAT-PMP</SwitchRow>
          <PreferenceSubRow width="md-10">
            <InputWithDice label={t("preferences.bt-port")} value={String(form.listenPort ?? "")} placeholder="BT Port" maxLength={8} onChange={(value) => set("listenPort", value)} onDice={() => set("listenPort", randomPort(20000, 24999))} />
          </PreferenceSubRow>
          <PreferenceSubRow width="md-10">
            <InputWithDice label={t("preferences.dht-port")} value={String(form.dhtListenPort ?? "")} placeholder="DHT Port" maxLength={8} onChange={(value) => set("dhtListenPort", value)} onDice={() => set("dhtListenPort", randomPort(25000, 29999))} />
          </PreferenceSubRow>
        </PreferenceGroup>
        <PreferenceGroup label={t("preferences.download-protocol")}>
          <PreferenceSubRow className="text-sm text-foreground">{t("preferences.protocols-default-client")}</PreferenceSubRow>
          <SwitchRow checked={!!protocols.magnet} onChange={(value) => set("protocols", { ...protocols, magnet: value })}>{t("preferences.protocols-magnet")}</SwitchRow>
          <SwitchRow checked={!!protocols.thunder} onChange={(value) => set("protocols", { ...protocols, thunder: value })}>{t("preferences.protocols-thunder")}</SwitchRow>
        </PreferenceGroup>
        <PreferenceGroup label={t("preferences.user-agent")}>
          <PreferenceSubRow>
            <div className="mb-1">{t("preferences.mock-user-agent")}</div>
            <Textarea rows={2} value={String(form.userAgent ?? "")} placeholder="User-Agent" onChange={(event) => set("userAgent", event.target.value)} />
            <ButtonGroup className="mt-2">
              {Object.entries(userAgentMap).map(([key, value]) => <Button key={key} variant="outline" size="sm" onClick={() => set("userAgent", value)}>{key}</Button>)}
            </ButtonGroup>
          </PreferenceSubRow>
        </PreferenceGroup>
        <PreferenceGroup label={t("preferences.developer")}>
          <PathRow label={t("preferences.aria2-conf-path")} value={String(config.aria2ConfPath ?? "")} />
          <PathRow label={t("preferences.download-session-path")} value={String(config.sessionPath ?? "")} />
          <PreferenceSubRow>
            <div>{t("preferences.app-log-path")}</div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,18fr)_minmax(120px,6fr)]">
              <div className="flex items-center gap-2">
                <Input disabled value={String(config.logPath ?? "")} className="min-w-0 flex-1" />
                <Button variant="outline" size="icon-sm" onClick={() => native.revealInFolder(String(config.logPath ?? ""))}><Folder /></Button>
              </div>
              <SelectBox value={String(form.logLevel)} onChange={(value) => set("logLevel", value)} items={LOG_LEVELS.map((value) => ({ value, label: value }))} className="w-full" />
            </div>
          </PreferenceSubRow>
          <PreferenceSubRow className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onConfirm({
                open: true,
                title: t("preferences.session-reset"),
                message: t("preferences.session-reset-confirm"),
                onConfirm: async () => {
                  await api.purgeTaskRecord().catch(() => undefined)
                  await api.pauseAllTask().catch(() => undefined)
                  await native.resetSession()
                },
              })}
            >
              {t("preferences.session-reset")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => onConfirm({
                open: true,
                title: t("preferences.factory-reset"),
                message: t("preferences.factory-reset-confirm"),
                onConfirm: async () => {
                  await native.resetAppConfig()
                  await onRefreshConfig()
                },
              })}
            >
              {t("preferences.factory-reset")}
            </Button>
          </PreferenceSubRow>
        </PreferenceGroup>
      </div>
      <PreferenceActions onSave={save} onReset={() => setForm(original)} />
    </PreferenceFrame>
  )
}

const advancedForm = (config: PreferenceConfig) => ({
  autoCheckUpdate: config.autoCheckUpdate,
  autoSyncTracker: config.autoSyncTracker,
  btTracker: convertCommaToLine(String(config.btTracker ?? "")),
  dhtListenPort: config.dhtListenPort,
  enableUpnp: config.enableUpnp,
  lastCheckUpdateTime: config.lastCheckUpdateTime,
  lastSyncTrackerTime: config.lastSyncTrackerTime,
  listenPort: config.listenPort,
  logLevel: config.logLevel,
  proxy: { ...(config.proxy ?? {}) },
  protocols: { ...(config.protocols ?? {}) },
  rpcListenPort: config.rpcListenPort,
  rpcSecret: config.rpcSecret,
  trackerSource: config.trackerSource ?? [],
  userAgent: config.userAgent,
})

const userAgentMap = {
  aria2: "aria2/1.36.0",
  transmission: "Transmission/3.00",
  chrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0 Safari/537.36",
  du: "netdisk;11.4.5;PC;PC-Windows;10.0.19045;WindowsBaiduYunGuanJia",
}

function PreferenceLab({ active, navItems, config }: { active: boolean; navItems: SubnavItem[]; config: PreferenceConfig }) {
  const theme = config.theme === APP_THEME.AUTO ? systemTheme() : config.theme
  const url = `https://motrix.app/lab?lite=true&theme=${theme}&lang=${config.locale}`
  return (
    <PreferenceFrame title={t("preferences.lab")} active={active} navItems={navItems}>
      <iframe title="Motrix Lab" src={url} className="h-[calc(100vh-150px)] w-full border-0" />
    </PreferenceFrame>
  )
}

type PreferenceRowWidth = "span-16" | "span-24" | "md-10" | "md-12" | "md-18" | "proxy-server" | "proxy-wide"

function preferenceRowWidth(width: PreferenceRowWidth = "span-24") {
  const map: Record<PreferenceRowWidth, string> = {
    "span-16": "w-full sm:w-2/3",
    "span-24": "w-full",
    "md-10": "w-full sm:w-3/4 md:w-5/12",
    "md-12": "w-full sm:w-3/4 md:w-1/2",
    "md-18": "w-full sm:w-3/4 md:w-3/4",
    "proxy-server": "w-full sm:w-5/6 md:w-2/3",
    "proxy-wide": "w-full sm:w-full md:w-5/6",
  }
  return map[width]
}

function PreferenceGroup({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-[25%_minmax(0,1fr)]", className)}>
      <div className="pt-1.5 text-left text-sm text-muted-foreground sm:text-right">{label ? `${label}: ` : ""}</div>
      <div className="min-w-0 space-y-2 text-sm text-foreground">{children}</div>
    </div>
  )
}

function PreferenceSubRow({
  children,
  className,
  width = "span-24",
}: {
  children: React.ReactNode
  className?: string
  width?: PreferenceRowWidth
}) {
  return (
    <div className={cn("min-h-8 min-w-0 text-sm leading-7 text-foreground", preferenceRowWidth(width), className)}>
      {children}
    </div>
  )
}

function HelpLink({
  href,
  children,
  className,
  inline = false,
}: {
  href: string
  children: React.ReactNode
  className?: string
  inline?: boolean
}) {
  return (
    <a
      href={href}
      className={cn(
        inline ? "inline-flex" : "flex",
        "items-center gap-1 text-sm leading-5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
        className,
      )}
      onClick={(event) => {
        event.preventDefault()
        openExternal(href)
      }}
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  )
}

function ThemeSwitcher({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const items = [
    { value: APP_THEME.AUTO, label: t("preferences.theme-auto"), image: themeAuto },
    { value: APP_THEME.LIGHT, label: t("preferences.theme-light"), image: themeLight },
    { value: APP_THEME.DARK, label: t("preferences.theme-dark"), image: themeDark },
  ]
  return (
    <ul className="flex flex-wrap gap-4 p-0">
      {items.map((item) => (
        <li
          key={item.value}
          onClick={() => onChange(item.value)}
          className="cursor-pointer text-center"
        >
          <span className={cn("block h-11 w-[68px] rounded-md border bg-center bg-cover", value === item.value && "border-primary ring-1 ring-primary")} style={{ backgroundImage: `url(${item.image})` }} />
          <span className={cn("mt-2 block text-[13px] leading-5", value === item.value && "text-primary")}>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}

function CheckRow({
  show = true,
  checked,
  onChange,
  children,
  width,
}: {
  show?: boolean
  checked: boolean
  onChange: (value: boolean) => void
  children: React.ReactNode
  width?: PreferenceRowWidth
}) {
  if (!show) return null
  return (
    <PreferenceSubRow className="flex items-center" width={width}>
      <LabeledCheckbox checked={checked} onChange={onChange}>{children}</LabeledCheckbox>
    </PreferenceSubRow>
  )
}

function SwitchRow({
  checked,
  onChange,
  children,
  width,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  children: React.ReactNode
  width?: PreferenceRowWidth
}) {
  return (
    <PreferenceSubRow className="flex items-center" width={width}>
      <Switch checked={checked} onCheckedChange={(value) => onChange(!!value)} />
      <button type="button" className="ml-2 text-left" onClick={() => onChange(!checked)}>
        {children}
      </button>
    </PreferenceSubRow>
  )
}

function NumberRow({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return (
    <PreferenceSubRow className="flex flex-wrap items-center gap-2">
      <span>{label}</span>
      <Input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} className="w-32" />
    </PreferenceSubRow>
  )
}

function SpeedLimitRow({ label, value, unit, units, onChange }: { label: string; value: unknown; unit: string; units: { label: string; value: string }[]; onChange: (value: string | number) => void }) {
  const [selectedUnit, setSelectedUnit] = useState(unit)
  const number = Number.parseInt(String(value), 10) || 0
  return (
    <PreferenceSubRow className="flex flex-wrap items-center gap-2">
      <span>{label}</span>
      <Input type="number" value={number} min={0} max={65535} onChange={(event) => onChange(Number(event.target.value) > 0 ? `${event.target.value}${selectedUnit}` : 0)} className="w-32" />
      <SelectBox
        value={selectedUnit}
        onChange={(next) => {
          setSelectedUnit(next)
          onChange(number > 0 ? `${number}${next}` : 0)
        }}
        items={units}
        className="w-28"
      />
    </PreferenceSubRow>
  )
}

function SelectBox({ value, onChange, items, className }: { value: string; onChange: (value: string) => void; items: { label: string; value: string | number }[]; className?: string }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(String(next ?? ""))}>
      <SelectTrigger className={className ?? "w-64"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => <SelectItem key={String(item.value)} value={String(item.value)}>{item.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function MultiSelect({ values, options, onChange }: { values: string[]; options: { label: string; value: string }[]; onChange: (value: string[]) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="min-h-8 w-full justify-between" />}>
        <span className="truncate">{values.length ? `${values.length} selected` : "Select"}</span>
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-80 min-w-80 overflow-auto">
        {options.map((option) => {
          const checked = values.includes(option.value)
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={(event) => {
                event.preventDefault()
                onChange(checked ? values.filter((item) => item !== option.value) : [...values, option.value])
              }}
            >
              <Check className={cn("mr-2 size-4", !checked && "opacity-0")} />
              <span className="truncate">{option.label}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function InputWithDice({
  label,
  value,
  onChange,
  onDice,
  className,
  placeholder,
  maxLength,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onDice: () => void | Promise<void>
  className?: string
  placeholder?: string
  maxLength?: number
}) {
  return (
    <div className={cn("space-y-1.5 text-sm leading-7 text-foreground", className)}>
      <div>{label}</div>
      <div className="flex items-center gap-2">
        <Input value={value} placeholder={placeholder} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1" />
        <Button variant="outline" size="icon-sm" onClick={() => void onDice()}><Dice5 /></Button>
      </div>
    </div>
  )
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <PreferenceSubRow className="space-y-1.5">
      <div>{label}</div>
      <div className="flex items-center gap-2">
        <Input disabled value={value} className="min-w-0 flex-1" />
        <Button variant="outline" size="icon-sm" onClick={() => native.revealInFolder(value)}><Folder /></Button>
      </div>
    </PreferenceSubRow>
  )
}

function PreferenceActions({ onSave, onReset }: { onSave: () => void | Promise<void>; onReset: () => void }) {
  return (
    <div className="sticky bottom-0 flex gap-2 border-t bg-background/95 px-4 py-6">
      <Button onClick={() => void onSave()}>{t("preferences.save")}</Button>
      <Button variant="outline" onClick={onReset}>{t("preferences.discard")}</Button>
    </div>
  )
}

function AboutDialog({ visible, onClose, engineInfo }: { visible: boolean; onClose: () => void; engineInfo: EngineInfo }) {
  return (
    <Dialog open={visible} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("app.about")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <img src={logo} className="h-8" alt="Motrix" draggable={false} />
          <div>
            <div className="text-lg font-medium">Motrix</div>
            <div className="text-sm text-muted-foreground">A full-featured download manager</div>
          </div>
          <div className="grid w-full grid-cols-[1fr_1fr] gap-2 text-sm">
            <div className="text-right text-muted-foreground">{t("about.engine-version")}:</div>
            <div className="text-left">{engineInfo.version || "aria2"}</div>
            <div className="text-right text-muted-foreground">{t("about.license")}:</div>
            <div className="text-left">MIT</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openExternal("https://motrix.app/")}>{t("about.about")} <ExternalLink /></Button>
            <Button variant="outline" onClick={() => openExternal("https://motrix.app/release")}>{t("about.release")} <ExternalLink /></Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmDialog({ state, setState }: { state: ConfirmState; setState: React.Dispatch<React.SetStateAction<ConfirmState>> }) {
  const [checked, setChecked] = useState(false)
  useEffect(() => {
    if (state.open) setChecked(!!state.checked)
  }, [state])
  return (
    <AlertDialog open={state.open} onOpenChange={(open) => !open && setState({ open: false })}>
      {state.open && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state.title}</AlertDialogTitle>
            <AlertDialogDescription>{state.message}</AlertDialogDescription>
          </AlertDialogHeader>
          {state.checkbox && <LabeledCheckbox checked={checked} onChange={setChecked}>{state.checkbox}</LabeledCheckbox>}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("app.no")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void state.onConfirm(checked)
                setState({ open: false })
              }}
            >
              {t("app.yes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}

function openExternal(url: string) {
  void import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(url))
}

function isMac() {
  return navigator.platform.toLowerCase().includes("mac")
}

function isLinux() {
  return navigator.userAgent.toLowerCase().includes("linux")
}

function isWindowsOrLinux() {
  const agent = navigator.userAgent.toLowerCase()
  return agent.includes("windows") || agent.includes("linux")
}

export default App
