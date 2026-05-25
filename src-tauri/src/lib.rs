use igd::{search_gateway, PortMappingProtocol, SearchOptions};
use rand::{distr::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{
    fs,
    net::{Ipv4Addr, SocketAddrV4, TcpListener, UdpSocket},
    path::{Path, PathBuf},
    process::{Child, Command},
    sync::Mutex,
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State, Window};

const ENGINE_RPC_HOST: &str = "127.0.0.1";
const ENGINE_RPC_PORT: u16 = 16800;
const MAX_CONNECTION_PER_SERVER: u16 = 64;

#[derive(Default)]
struct AppState {
    engine: Mutex<Option<Child>>,
    runtime_rpc_port: Mutex<Option<u16>>,
    upnp_ports: Mutex<Vec<u16>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsonRpcRequest {
    method: String,
    #[serde(default)]
    params: Vec<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfigPayload {
    #[serde(default)]
    user: Map<String, Value>,
    #[serde(default)]
    system: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ProxyConfig {
    #[serde(default)]
    enable: bool,
    #[serde(default)]
    server: String,
    #[serde(default)]
    bypass: String,
    #[serde(default)]
    scope: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddTaskEvent {
    kind: String,
    url: Option<String>,
    file: Option<String>,
    name: Option<String>,
    data_url: Option<String>,
}

fn app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn config_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join(format!("{name}.json")))
}

fn read_json(path: &Path) -> Map<String, Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<Map<String, Value>>(&text).ok())
        .unwrap_or_default()
}

fn write_json(path: &Path, value: &Map<String, Value>) -> Result<(), String> {
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

fn downloads_dir() -> String {
    dirs::download_dir()
        .or_else(|| dirs::home_dir().map(|p| p.join("Downloads")))
        .unwrap_or_else(|| PathBuf::from("."))
        .to_string_lossy()
        .to_string()
}

fn default_user_config() -> Map<String, Value> {
    let mut config = Map::new();
    config.insert("auto-check-update".into(), json!(cfg!(target_os = "macos")));
    config.insert("auto-hide-window".into(), json!(false));
    config.insert("auto-sync-tracker".into(), json!(true));
    config.insert("enable-upnp".into(), json!(true));
    config.insert(
        "engine-max-connection-per-server".into(),
        json!(MAX_CONNECTION_PER_SERVER),
    );
    config.insert("favorite-directories".into(), json!([]));
    config.insert(
        "hide-app-menu".into(),
        json!(cfg!(any(target_os = "windows", target_os = "linux"))),
    );
    config.insert("history-directories".into(), json!([]));
    config.insert("keep-seeding".into(), json!(false));
    config.insert("keep-window-state".into(), json!(false));
    config.insert("last-check-update-time".into(), json!(0));
    config.insert("last-sync-tracker-time".into(), json!(0));
    config.insert("locale".into(), json!("en-US"));
    config.insert("log-level".into(), json!("warn"));
    config.insert("new-task-show-downloading".into(), json!(true));
    config.insert("no-confirm-before-delete-task".into(), json!(false));
    config.insert("open-at-login".into(), json!(false));
    config.insert(
        "protocols".into(),
        json!({ "magnet": true, "thunder": false }),
    );
    config.insert("proxy".into(), json!({ "enable": false, "server": "", "bypass": "", "scope": ["download", "update-app", "update-trackers"] }));
    config.insert("resume-all-when-app-launched".into(), json!(false));
    config.insert("run-mode".into(), json!(1));
    config.insert("show-progress-bar".into(), json!(true));
    config.insert("task-notification".into(), json!(true));
    config.insert("theme".into(), json!("auto"));
    config.insert(
        "tracker-source".into(),
        json!([
            "https://cdn.jsdelivr.net/gh/ngosang/trackerslist/trackers_best_ip.txt",
            "https://cdn.jsdelivr.net/gh/ngosang/trackerslist/trackers_best.txt"
        ]),
    );
    config.insert("tray-theme".into(), json!("auto"));
    config.insert("tray-speedometer".into(), json!(cfg!(target_os = "macos")));
    config.insert("update-channel".into(), json!("latest"));
    config.insert("window-state".into(), json!({}));
    config
}

fn default_system_config(app: &AppHandle) -> Map<String, Value> {
    let base = app_dir(app).unwrap_or_else(|_| PathBuf::from("."));
    let mut config = Map::new();
    config.insert("all-proxy".into(), json!(""));
    config.insert("allow-overwrite".into(), json!(false));
    config.insert("auto-file-renaming".into(), json!(true));
    config.insert("bt-exclude-tracker".into(), json!(""));
    config.insert("bt-force-encryption".into(), json!(false));
    config.insert("bt-load-saved-metadata".into(), json!(true));
    config.insert("bt-save-metadata".into(), json!(true));
    config.insert("bt-tracker".into(), json!(""));
    config.insert("continue".into(), json!(true));
    config.insert(
        "dht-file-path".into(),
        json!(base.join("dht.dat").to_string_lossy().to_string()),
    );
    config.insert(
        "dht-file-path6".into(),
        json!(base.join("dht6.dat").to_string_lossy().to_string()),
    );
    config.insert("dht-listen-port".into(), json!(26701));
    config.insert("dir".into(), json!(downloads_dir()));
    config.insert("enable-dht6".into(), json!(true));
    config.insert("follow-metalink".into(), json!(true));
    config.insert("follow-torrent".into(), json!(true));
    config.insert("listen-port".into(), json!(21301));
    config.insert("max-concurrent-downloads".into(), json!(5));
    config.insert(
        "max-connection-per-server".into(),
        json!(MAX_CONNECTION_PER_SERVER),
    );
    config.insert("max-download-limit".into(), json!(0));
    config.insert("max-overall-download-limit".into(), json!(0));
    config.insert("max-overall-upload-limit".into(), json!(0));
    config.insert("no-proxy".into(), json!(""));
    config.insert("pause-metadata".into(), json!(false));
    config.insert("pause".into(), json!(true));
    config.insert("rpc-listen-port".into(), json!(ENGINE_RPC_PORT));
    config.insert("rpc-secret".into(), json!(""));
    config.insert("seed-ratio".into(), json!(2));
    config.insert("seed-time".into(), json!(2880));
    config.insert("split".into(), json!(MAX_CONNECTION_PER_SERVER));
    config.insert("user-agent".into(), json!("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0 Safari/537.36"));
    config
}

fn merged_config(app: &AppHandle) -> Result<Map<String, Value>, String> {
    let mut user = default_user_config();
    user.extend(read_json(&config_path(app, "user")?));
    let mut system = default_system_config(app);
    system.extend(read_json(&config_path(app, "system")?));
    let mut result = system;
    result.extend(user);
    let base = app_dir(app)?;
    result.insert(
        "aria2-conf-path".into(),
        json!(engine_conf_path(app)?.to_string_lossy().to_string()),
    );
    result.insert(
        "session-path".into(),
        json!(base.join("download.session").to_string_lossy().to_string()),
    );
    result.insert(
        "log-path".into(),
        json!(app
            .path()
            .app_log_dir()
            .unwrap_or(base)
            .to_string_lossy()
            .to_string()),
    );
    Ok(result)
}

fn value_to_arg(value: &Value) -> String {
    match value {
        Value::Bool(v) => v.to_string(),
        Value::Number(v) => v.to_string(),
        Value::String(v) => v.clone(),
        Value::Array(values) => values
            .iter()
            .map(value_to_arg)
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Object(_) | Value::Null => String::new(),
    }
}

fn proxy_scope_enabled(proxy: &ProxyConfig, scope: &str) -> bool {
    proxy.enable && !proxy.server.is_empty() && proxy.scope.iter().any(|item| item == scope)
}

fn proxy_system_options(proxy: &ProxyConfig) -> Map<String, Value> {
    let mut system = Map::new();
    if proxy_scope_enabled(proxy, "download") {
        system.insert("all-proxy".into(), json!(proxy.server.clone()));
        system.insert("no-proxy".into(), json!(proxy.bypass.clone()));
    } else {
        system.insert("all-proxy".into(), json!(""));
        system.insert("no-proxy".into(), json!(""));
    }
    system
}

fn should_restart_engine(system: &Map<String, Value>) -> bool {
    system.keys().any(|key| {
        matches!(
            key.as_str(),
            "dht-listen-port" | "hide-app-menu" | "listen-port" | "rpc-listen-port" | "rpc-secret"
        )
    })
}

fn value_as_u16(config: &Map<String, Value>, key: &str) -> Option<u16> {
    config
        .get(key)
        .and_then(|value| {
            value
                .as_u64()
                .or_else(|| value.as_str().and_then(|text| text.parse::<u64>().ok()))
        })
        .and_then(|value| u16::try_from(value).ok())
        .filter(|value| *value > 0)
}

fn configured_rpc_port(config: &Map<String, Value>) -> u16 {
    value_as_u16(config, "rpc-listen-port").unwrap_or(ENGINE_RPC_PORT)
}

fn runtime_rpc_port(app: &AppHandle) -> Option<u16> {
    app.state::<AppState>()
        .runtime_rpc_port
        .lock()
        .ok()
        .and_then(|port| *port)
}

fn current_rpc_port(app: &AppHandle) -> Result<u16, String> {
    if let Some(port) = runtime_rpc_port(app) {
        return Ok(port);
    }
    Ok(configured_rpc_port(&merged_config(app)?))
}

fn port_available(port: u16) -> bool {
    TcpListener::bind((Ipv4Addr::LOCALHOST, port)).is_ok()
}

fn rpc_port_candidates(preferred: u16) -> impl Iterator<Item = u16> {
    (0..100).filter_map(move |offset| preferred.checked_add(offset))
}

fn desired_upnp_ports(config: &Map<String, Value>) -> Vec<u16> {
    if !config
        .get("enable-upnp")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Vec::new();
    }
    let mut ports = Vec::new();
    for key in ["listen-port", "dht-listen-port"] {
        if let Some(port) = value_as_u16(config, key) {
            if !ports.contains(&port) {
                ports.push(port);
            }
        }
    }
    ports
}

fn local_ipv4() -> Result<Ipv4Addr, String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket.connect("8.8.8.8:80").map_err(|e| e.to_string())?;
    match socket.local_addr().map_err(|e| e.to_string())?.ip() {
        std::net::IpAddr::V4(ip) => Ok(ip),
        std::net::IpAddr::V6(_) => Err("No local IPv4 address available".into()),
    }
}

fn map_upnp_port(port: u16) -> Result<(), String> {
    let gateway = search_gateway(SearchOptions::default()).map_err(|e| e.to_string())?;
    let local = SocketAddrV4::new(local_ipv4()?, port);
    let mut mapped = false;
    let mut last_error = None;
    for protocol in [PortMappingProtocol::TCP, PortMappingProtocol::UDP] {
        match gateway.add_port(protocol, port, local, 0, "Motrix") {
            Ok(_) => mapped = true,
            Err(error) => last_error = Some(error.to_string()),
        }
    }
    if mapped {
        Ok(())
    } else {
        Err(last_error.unwrap_or_else(|| "UPnP port mapping failed".into()))
    }
}

fn unmap_upnp_port(port: u16) {
    if let Ok(gateway) = search_gateway(SearchOptions::default()) {
        let _ = gateway.remove_port(PortMappingProtocol::TCP, port);
        let _ = gateway.remove_port(PortMappingProtocol::UDP, port);
    }
}

fn sync_upnp_inner(app: &AppHandle, state: &State<AppState>) -> Result<(), String> {
    let desired = desired_upnp_ports(&merged_config(app)?);
    let current = state.upnp_ports.lock().map_err(|e| e.to_string())?.clone();
    for port in current.iter().filter(|port| !desired.contains(port)) {
        unmap_upnp_port(*port);
    }
    let mut mapped = current
        .into_iter()
        .filter(|port| desired.contains(port))
        .collect::<Vec<_>>();
    for port in desired {
        if mapped.contains(&port) {
            continue;
        }
        if map_upnp_port(port).is_ok() {
            mapped.push(port);
        }
    }
    *state.upnp_ports.lock().map_err(|e| e.to_string())? = mapped;
    Ok(())
}

fn sync_upnp(app: AppHandle) {
    thread::spawn(move || {
        let state = app.state::<AppState>();
        if let Err(error) = sync_upnp_inner(&app, &state) {
            eprintln!("Failed to sync UPnP: {error}");
        }
    });
}

fn clear_upnp_inner(state: &State<AppState>) {
    if let Ok(mut ports) = state.upnp_ports.lock() {
        for port in ports.iter() {
            unmap_upnp_port(*port);
        }
        ports.clear();
    }
}

fn auto_resume_inner(app: &AppHandle) {
    let enabled = merged_config(app)
        .ok()
        .and_then(|config| {
            config
                .get("resume-all-when-app-launched")
                .and_then(Value::as_bool)
        })
        .unwrap_or(false);
    if enabled {
        let _ = rpc_call(app, "unpauseAll", vec![]);
    }
}

fn run_engine_ready_tasks(app: AppHandle) {
    thread::spawn(move || {
        let state = app.state::<AppState>();
        if let Err(error) = sync_upnp_inner(&app, &state) {
            eprintln!("Failed to sync UPnP: {error}");
        }
        auto_resume_inner(&app);
    });
}

fn engine_arch() -> &'static str {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    return "arm64";
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    return "x64";
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    return "arm64";
    #[cfg(all(
        target_os = "windows",
        any(target_arch = "x86_64", target_arch = "aarch64")
    ))]
    return "x64";
    #[allow(unreachable_code)]
    "x64"
}

fn engine_platform() -> &'static str {
    #[cfg(target_os = "macos")]
    return "darwin";
    #[cfg(target_os = "windows")]
    return "win32";
    #[cfg(target_os = "linux")]
    return "linux";
    #[allow(unreachable_code)]
    "darwin"
}

fn engine_bin_name() -> &'static str {
    #[cfg(target_os = "windows")]
    return "aria2c.exe";
    #[cfg(not(target_os = "windows"))]
    return "aria2c";
}

fn resource_base(app: &AppHandle) -> Result<PathBuf, String> {
    match app
        .path()
        .resolve("extra", tauri::path::BaseDirectory::Resource)
    {
        Ok(path) => Ok(path),
        Err(_) => std::env::current_dir()
            .map(|cwd| cwd.join("src-tauri").join("extra"))
            .map_err(|e| e.to_string()),
    }
}

fn engine_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resource_base(app)?
        .join(engine_platform())
        .join(engine_arch())
        .join("engine"))
}

fn engine_bin_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(engine_dir(app)?.join(engine_bin_name()))
}

fn engine_conf_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(engine_dir(app)?.join("aria2.conf"))
}

fn start_engine_inner(app: &AppHandle, state: &State<AppState>) -> Result<(), String> {
    let mut engine = state.engine.lock().map_err(|e| e.to_string())?;
    if let Some(child) = engine.as_mut() {
        match child.try_wait() {
            Ok(Some(_)) => {
                *engine = None;
            }
            Ok(None) => return Ok(()),
            Err(_) => {
                *engine = None;
            }
        }
    }

    let mut config = merged_config(app)?;
    let preferred_rpc_port = configured_rpc_port(&config);
    let session = app_dir(app)?.join("download.session");
    for rpc_port in rpc_port_candidates(preferred_rpc_port) {
        if !port_available(rpc_port) {
            continue;
        }
        config.insert("rpc-listen-port".into(), json!(rpc_port));

        let mut args = vec![
            format!("--conf-path={}", engine_conf_path(app)?.to_string_lossy()),
            format!("--save-session={}", session.to_string_lossy()),
        ];
        if session.exists() {
            args.push(format!("--input-file={}", session.to_string_lossy()));
        }

        for (key, value) in config.iter() {
            if key.contains("path") || key == "window-state" || key == "protocols" || key == "proxy"
            {
                continue;
            }
            if !is_system_key(key) {
                continue;
            }
            let rendered = value_to_arg(value);
            if !rendered.is_empty() {
                args.push(format!("--{key}={rendered}"));
            }
        }

        let mut child = Command::new(engine_bin_path(app)?)
            .args(args)
            .spawn()
            .map_err(|e| format!("Failed to start aria2 engine: {e}"))?;
        thread::sleep(Duration::from_millis(250));
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            continue;
        }
        *state.runtime_rpc_port.lock().map_err(|e| e.to_string())? = Some(rpc_port);
        *engine = Some(child);
        return Ok(());
    }
    Err(format!(
        "Failed to start aria2 engine: no available RPC port near {preferred_rpc_port}"
    ))
}

fn stop_engine_inner(app: &AppHandle, state: &State<AppState>) {
    let _ = rpc_call(app, "forceShutdown", vec![]);
    let child = state
        .engine
        .lock()
        .ok()
        .and_then(|mut engine| engine.take());
    if let Some(mut child) = child {
        for _ in 0..10 {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) => thread::sleep(Duration::from_millis(100)),
                Err(_) => break,
            }
        }
        if matches!(child.try_wait(), Ok(None)) {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    if let Ok(mut port) = state.runtime_rpc_port.lock() {
        *port = None;
    }
}

fn is_system_key(key: &str) -> bool {
    matches!(
        key,
        "all-proxy"
            | "all-proxy-passwd"
            | "all-proxy-user"
            | "allow-overwrite"
            | "auto-file-renaming"
            | "bt-exclude-tracker"
            | "bt-force-encryption"
            | "bt-load-saved-metadata"
            | "bt-save-metadata"
            | "bt-tracker"
            | "continue"
            | "dht-file-path"
            | "dht-file-path6"
            | "dht-listen-port"
            | "dir"
            | "enable-dht6"
            | "follow-metalink"
            | "follow-torrent"
            | "listen-port"
            | "max-concurrent-downloads"
            | "max-connection-per-server"
            | "max-download-limit"
            | "max-overall-download-limit"
            | "max-overall-upload-limit"
            | "no-proxy"
            | "pause-metadata"
            | "pause"
            | "rpc-listen-port"
            | "rpc-secret"
            | "seed-ratio"
            | "seed-time"
            | "split"
            | "user-agent"
            | "select-file"
            | "out"
            | "header"
            | "referer"
            | "cookie"
    )
}

fn rpc_url(app: &AppHandle) -> Result<String, String> {
    let port = current_rpc_port(app)?;
    Ok(format!("http://{ENGINE_RPC_HOST}:{port}/jsonrpc"))
}

fn rpc_secret(app: &AppHandle) -> Result<String, String> {
    let config = merged_config(app)?;
    Ok(config
        .get("rpc-secret")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string())
}

fn with_secret(app: &AppHandle, mut params: Vec<Value>) -> Result<Vec<Value>, String> {
    let secret = rpc_secret(app)?;
    if !secret.is_empty() {
        params.insert(0, json!(format!("token:{secret}")));
    }
    Ok(params)
}

fn prefixed_rpc_method(method: &str) -> String {
    if method.starts_with("aria2.") || method.starts_with("system.") {
        method.to_string()
    } else {
        format!("aria2.{method}")
    }
}

fn rpc_call_raw(app: &AppHandle, method: String, params: Vec<Value>) -> Result<Value, String> {
    let request = json!({
        "jsonrpc": "2.0",
        "id": "motrix-tauri",
        "method": method,
        "params": params,
    });
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .post(rpc_url(app)?)
        .json(&request)
        .send()
        .map_err(|e| e.to_string())?
        .json::<Value>()
        .map_err(|e| e.to_string())?;
    if let Some(error) = response.get("error") {
        return Err(error.to_string());
    }
    Ok(response.get("result").cloned().unwrap_or(Value::Null))
}

fn rpc_call(app: &AppHandle, method: &str, params: Vec<Value>) -> Result<Value, String> {
    rpc_call_raw(app, prefixed_rpc_method(method), with_secret(app, params)?)
}

fn rpc_multicall(app: &AppHandle, calls: Vec<Vec<Value>>) -> Result<Value, String> {
    let secret = rpc_secret(app)?;
    let calls = calls
        .into_iter()
        .map(|mut call| {
            let method = call
                .first()
                .and_then(Value::as_str)
                .map(prefixed_rpc_method)
                .unwrap_or_default();
            if !call.is_empty() {
                call.remove(0);
            }
            if !secret.is_empty() {
                call.insert(0, json!(format!("token:{secret}")));
            }
            json!({
                "methodName": method,
                "params": call,
            })
        })
        .collect::<Vec<_>>();
    rpc_call_raw(
        app,
        "system.multicall".to_string(),
        vec![Value::Array(calls)],
    )
}

#[tauri::command]
fn get_app_config(app: AppHandle) -> Result<Value, String> {
    let mut config = merged_config(&app)?;
    if let Some(port) = runtime_rpc_port(&app) {
        config.insert("rpc-listen-port".into(), json!(port));
    }
    Ok(Value::Object(config))
}

#[tauri::command]
fn save_app_config(
    app: AppHandle,
    state: State<AppState>,
    mut payload: AppConfigPayload,
) -> Result<(), String> {
    if let Some(proxy) = payload
        .user
        .get("proxy")
        .and_then(|value| serde_json::from_value::<ProxyConfig>(value.clone()).ok())
    {
        payload.system.extend(proxy_system_options(&proxy));
    }
    let restart_engine = should_restart_engine(&payload.system);

    if !payload.user.is_empty() {
        let path = config_path(&app, "user")?;
        let mut user = read_json(&path);
        user.extend(payload.user);
        write_json(&path, &user)?;
    }
    if !payload.system.is_empty() {
        let path = config_path(&app, "system")?;
        let mut system = read_json(&path);
        system.extend(payload.system.clone());
        write_json(&path, &system)?;
        if restart_engine {
            stop_engine_inner(&app, &state);
            start_engine_inner(&app, &state)?;
        } else {
            let _ = rpc_call(
                &app,
                "changeGlobalOption",
                vec![Value::Object(payload.system)],
            );
        }
    }
    sync_upnp(app);
    Ok(())
}

#[tauri::command]
fn reset_app_config(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    stop_engine_inner(&app, &state);
    let _ = fs::remove_file(config_path(&app, "user")?);
    let _ = fs::remove_file(config_path(&app, "system")?);
    start_engine_inner(&app, &state)?;
    sync_upnp(app);
    Ok(())
}

#[tauri::command]
fn reset_session(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    stop_engine_inner(&app, &state);
    let _ = fs::remove_file(app_dir(&app)?.join("download.session"));
    start_engine_inner(&app, &state)?;
    sync_upnp(app);
    Ok(())
}

#[tauri::command]
fn aria2(app: AppHandle, request: JsonRpcRequest) -> Result<Value, String> {
    if request.method == "multicall" {
        let calls = request
            .params
            .into_iter()
            .next()
            .and_then(|v| serde_json::from_value::<Vec<Vec<Value>>>(v).ok())
            .unwrap_or_default();
        rpc_multicall(&app, calls)
    } else {
        rpc_call(&app, &request.method, request.params)
    }
}

#[tauri::command]
fn reveal_in_folder(path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg("-R").arg(&target);
        command
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(format!("/select,{}", target.to_string_lossy()));
        command
    };
    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(target.parent().unwrap_or(&target));
        command
    };
    command.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(path);
        command
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", &path]);
        command
    };
    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        command
    };
    command.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn trash_path(path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    if target.exists() {
        trash::delete(target).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn window_action(window: Window, action: String) -> Result<(), String> {
    match action.as_str() {
        "minimize" => window.minimize().map_err(|e| e.to_string()),
        "maximize" => {
            if window.is_maximized().map_err(|e| e.to_string())? {
                window.unmaximize().map_err(|e| e.to_string())
            } else {
                window.maximize().map_err(|e| e.to_string())
            }
        }
        "close" => window.close().map_err(|e| e.to_string()),
        "hide" => window.hide().map_err(|e| e.to_string()),
        "show" => window.show().map_err(|e| e.to_string()),
        _ => Ok(()),
    }
}

#[tauri::command]
fn app_event(app: AppHandle, event: String, payload: Value) -> Result<(), String> {
    app.emit(&event, payload).map_err(|e| e.to_string())
}

#[tauri::command]
fn random_secret() -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(16)
        .map(char::from)
        .collect()
}

#[tauri::command]
async fn fetch_text(url: String, proxy: Option<ProxyConfig>) -> Result<String, String> {
    let mut client = reqwest::Client::builder().timeout(Duration::from_secs(30));
    if let Some(proxy) = proxy.filter(|proxy| proxy_scope_enabled(proxy, "update-trackers")) {
        client = client.proxy(reqwest::Proxy::all(&proxy.server).map_err(|e| e.to_string())?);
    }
    client
        .build()
        .map_err(|e| e.to_string())?
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn show_add_task(app: AppHandle, event: AddTaskEvent) -> Result<(), String> {
    app.emit("motrix://add-task", event)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            if let Err(error) = start_engine_inner(&handle, &state) {
                eprintln!("{error}");
            } else {
                run_engine_ready_tasks(handle);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_config,
            save_app_config,
            reset_app_config,
            reset_session,
            aria2,
            reveal_in_folder,
            open_path,
            trash_path,
            window_action,
            app_event,
            random_secret,
            fetch_text,
            show_add_task
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app = window.app_handle();
                let state = app.state::<AppState>();
                clear_upnp_inner(&state);
                stop_engine_inner(app, &state);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
            ) {
                let state = app.state::<AppState>();
                clear_upnp_inner(&state);
                stop_engine_inner(app, &state);
            }
        });
}
