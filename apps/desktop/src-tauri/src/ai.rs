//! AI chat streaming proxy (spec §28-31).
//!
//! The webview never sees API keys or talks to provider hosts directly: the
//! command resolves the key from the secret store server-side, streams the
//! upstream SSE bytes through a Tauri Channel, and honours cancellation.
//! Provider logic (request shaping, delta extraction) stays in
//! `@deepread/ai-core` on the frontend — Rust is a dumb, safe pipe.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::ipc::Channel;
use tauri::{Manager, State};
use tokio::sync::Mutex;

use crate::error::{AppError, ErrorCode};
use crate::secrets::SecretStore;

#[derive(Default)]
pub struct AiState {
    pub cancelled: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub model: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiConfigStore {
    #[serde(default)]
    providers: Vec<AiProviderConfig>,
}

fn config_store_path(base: &Path) -> PathBuf {
    base.join("ai-config.json")
}

fn load_configs(base: &Path) -> AiConfigStore {
    std::fs::read_to_string(config_store_path(base))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save_configs(base: &Path, store: &AiConfigStore) -> Result<(), AppError> {
    std::fs::create_dir_all(base).map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "failed to create data directory").with_cause(err)
    })?;
    let bytes = serde_json::to_vec_pretty(store).map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "failed to serialize ai config").with_cause(err)
    })?;
    std::fs::write(config_store_path(base), bytes).map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "failed to write ai config").with_cause(err)
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiConfigSaveRequest {
    pub provider: AiProviderConfig,
    pub api_key: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigListResponse {
    pub providers: Vec<AiProviderConfig>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigSaveResponse {
    pub provider: AiProviderConfig,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiConfigRemoveRequest {
    pub id: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigRemoveResponse {
    pub removed: bool,
}

pub fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    app.path().app_data_dir().map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "app data directory unavailable").with_cause(err)
    })
}

#[tauri::command(rename = "ai.config.list")]
pub fn ai_config_list(app: tauri::AppHandle) -> Result<AiConfigListResponse, AppError> {
    Ok(AiConfigListResponse {
        providers: load_configs(&data_dir(&app)?).providers,
    })
}

/// Upsert the provider config and store its API key (keychain-first).
#[tauri::command(rename = "ai.config.save")]
pub fn ai_config_save(
    app: tauri::AppHandle,
    secrets: State<'_, SecretStore>,
    request: AiConfigSaveRequest,
) -> Result<AiConfigSaveResponse, AppError> {
    let base = data_dir(&app)?;
    let mut store = load_configs(&base);
    store.providers.retain(|p| p.id != request.provider.id);
    store.providers.push(request.provider.clone());
    save_configs(&base, &store)?;

    let key = format!("ai.key.{}", request.provider.id);
    crate::secrets::set_secret(&secrets, &base, &key, &request.api_key)?;
    Ok(AiConfigSaveResponse {
        provider: request.provider,
    })
}

#[tauri::command(rename = "ai.config.remove")]
pub fn ai_config_remove(
    app: tauri::AppHandle,
    secrets: State<'_, SecretStore>,
    request: AiConfigRemoveRequest,
) -> Result<AiConfigRemoveResponse, AppError> {
    let base = data_dir(&app)?;
    let mut store = load_configs(&base);
    let before = store.providers.len();
    store.providers.retain(|p| p.id != request.id);
    let removed = store.providers.len() != before;
    if removed {
        save_configs(&base, &store)?;
        let key = format!("ai.key.{}", request.id);
        crate::secrets::delete_secret(&secrets, &base, &key)?;
    }
    Ok(AiConfigRemoveResponse { removed })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiChatRequest {
    pub task_id: String,
    pub config_id: String,
    pub messages: Vec<Value>,
    #[serde(default)]
    pub temperature: Option<f64>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiChatResponse {
    pub task_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiCancelRequest {
    pub task_id: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiCancelResponse {
    pub cancelled: bool,
}

/// Pure helper: the upstream chat-completions URL for a configured base URL.
pub fn chat_endpoint(base_url: &str) -> String {
    format!("{}/chat/completions", base_url.trim_end_matches('/'))
}

/// Stream one chat completion, forwarding raw SSE bytes through the channel.
/// Public so the integration test can drive it against a local mock server
/// without a Tauri runtime.
pub async fn stream_chat(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    body: Value,
    cancelled: Arc<AtomicBool>,
    on_chunk: &(dyn Fn(String) + Send + Sync),
) -> Result<(), AppError> {
    let response = client
        .post(url)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|err| {
            AppError::new(ErrorCode::AiProviderError, "无法连接 AI 服务")
                .with_cause(err)
                .retryable()
        })?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::new(
            ErrorCode::AiProviderError,
            format!("AI 服务返回错误({status})"),
        )
        .with_context("body", Value::String(text.chars().take(400).collect()))
        .retryable());
    }

    let stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut stream = std::pin::pin!(stream);
    loop {
        if cancelled.load(Ordering::Relaxed) {
            on_chunk("[\"__CANCELLED__\"]".to_string());
            return Ok(());
        }
        match StreamExt::next(&mut stream).await {
            Some(Ok(bytes)) => {
                buffer.push_str(&String::from_utf8_lossy(&bytes));
                while let Some(boundary) = buffer.find("\n\n") {
                    let event = buffer[..boundary].to_string();
                    buffer.drain(..boundary + 2);
                    if let Some(data) = event
                        .lines()
                        .find_map(|line| line.strip_prefix("data: "))
                        .map(str::to_string)
                    {
                        on_chunk(data);
                    }
                }
            }
            Some(Err(err)) => {
                return Err(AppError::new(ErrorCode::AiProviderError, "AI 流式传输中断")
                    .with_cause(err)
                    .retryable());
            }
            None => break,
        }
    }
    Ok(())
}

fn emit_event(channel: &Channel<Value>, kind: &str, data: Value) {
    let _ = channel.send(json!({ "type": kind, "data": data }));
}

#[tauri::command(rename = "ai.chat")]
pub async fn ai_chat(
    app: tauri::AppHandle,
    state: State<'_, AiState>,
    secrets: State<'_, SecretStore>,
    request: AiChatRequest,
    on_event: Channel<Value>,
) -> Result<AiChatResponse, AppError> {
    let base = data_dir(&app)?;
    let config = load_configs(&base)
        .providers
        .into_iter()
        .find(|p| p.id == request.config_id)
        .ok_or_else(|| AppError::new(ErrorCode::AiProviderError, "AI 服务配置不存在"))?;
    let key = format!("ai.key.{}", request.config_id);
    let api_key = crate::secrets::get_secret(&secrets, &base, &key)?
        .ok_or_else(|| AppError::new(ErrorCode::AiProviderError, "请先填写该服务的 API Key"))?;

    let cancelled = Arc::new(AtomicBool::new(false));
    state
        .cancelled
        .lock()
        .await
        .insert(request.task_id.clone(), cancelled.clone());

    let mut body = json!({
        "model": config.model,
        "messages": request.messages,
        "stream": true,
    });
    if let Some(temperature) = request.temperature {
        body["temperature"] = json!(temperature);
    }
    let url = chat_endpoint(&config.base_url);
    let client = reqwest::Client::new();
    let task_id = request.task_id.clone();
    let channel = on_event.clone();

    tauri::async_runtime::spawn(async move {
        let on_chunk = |chunk: String| {
            if chunk == "[\"__CANCELLED__\"]" {
                emit_event(&channel, "cancelled", json!(null));
            } else {
                emit_event(&channel, "chunk", json!(chunk));
            }
        };
        let result = stream_chat(&client, &url, &api_key, body, cancelled, &on_chunk).await;
        match result {
            Ok(()) => emit_event(&channel, "done", json!(null)),
            Err(err) => emit_event(
                &channel,
                "error",
                json!({"code": err.code.as_str(), "message": err.message, "retryable": err.retryable}),
            ),
        }
    });

    Ok(AiChatResponse { task_id })
}

#[tauri::command(rename = "ai.cancel")]
pub async fn ai_cancel(
    state: State<'_, AiState>,
    request: AiCancelRequest,
) -> Result<AiCancelResponse, AppError> {
    let flag = state.cancelled.lock().await.remove(&request.task_id);
    if let Some(flag) = &flag {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(AiCancelResponse {
        cancelled: flag.is_some(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chat_endpoint_appends_path() {
        assert_eq!(
            chat_endpoint("https://api.example.com/v1"),
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(
            chat_endpoint("https://api.example.com/v1/"),
            "https://api.example.com/v1/chat/completions"
        );
    }

    #[test]
    fn config_store_round_trips() {
        let base = std::env::temp_dir().join(format!(
            "reader-ai-config-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let provider = AiProviderConfig {
            id: "0123456789abcdef".into(),
            name: "DeepSeek".into(),
            base_url: "https://api.deepseek.com/v1".into(),
            model: "deepseek-chat".into(),
        };
        let mut store = load_configs(&base);
        assert!(store.providers.is_empty());
        store.providers.push(provider.clone());
        save_configs(&base, &store).unwrap();
        assert_eq!(load_configs(&base).providers, vec![provider]);
    }
}
