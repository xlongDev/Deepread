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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub embedding_model: Option<String>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiEmbedRequest {
    #[allow(dead_code)] // protocol field; the embed call is not cancellable in-flight
    pub task_id: String,
    pub config_id: String,
    pub texts: Vec<String>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiEmbedResponse {
    pub vectors: Vec<Vec<f64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiIndexChunk {
    pub label: String,
    pub text: String,
    pub vector: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiIndexPayload {
    pub chunks: Vec<AiIndexChunk>,
    pub embedding_model: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiIndexGetRequest {
    pub book_hash: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiIndexGetResponse {
    pub index: Option<AiIndexPayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiIndexSetRequest {
    pub book_hash: String,
    pub index: AiIndexPayload,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiIndexSetResponse {
    pub saved_at: String,
}

pub const MAX_INDEX_BYTES: usize = 64 * 1024 * 1024;
pub const MAX_ARTIFACT_BYTES: usize = 4 * 1024 * 1024;

/// Validate the artifact kind against the protocol enum.
pub fn validate_artifact_kind(kind: &str) -> Result<(), AppError> {
    match kind {
        "summary" | "outline" | "notes" => Ok(()),
        other => Err(
            AppError::new(ErrorCode::SystemValidation, "未知的 artifact 类型")
                .with_context("kind", Value::String(other.to_string())),
        ),
    }
}

pub fn artifact_path(base: &Path, book_hash: &str, kind: &str) -> Result<PathBuf, AppError> {
    crate::state::validate_hash(book_hash)?;
    validate_artifact_kind(kind)?;
    Ok(base
        .join("ai-artifact")
        .join(format!("{book_hash}-{kind}.json")))
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredArtifact {
    pub payload: Value,
    pub created_at: String,
}

pub fn load_artifact(path: &Path) -> Result<Option<StoredArtifact>, AppError> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => {
            return Err(
                AppError::new(ErrorCode::StorageIo, "failed to read artifact").with_cause(err),
            );
        }
    };
    if bytes.len() > MAX_ARTIFACT_BYTES {
        return Err(AppError::new(
            ErrorCode::StorageCorrupt,
            "artifact is too large",
        ));
    }
    serde_json::from_slice(&bytes).map(Some).map_err(|err| {
        AppError::new(ErrorCode::StorageCorrupt, "artifact is corrupted").with_cause(err)
    })
}

pub fn store_artifact(path: &Path, artifact: &StoredArtifact) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| {
            AppError::new(ErrorCode::StorageIo, "failed to create artifact directory")
                .with_cause(err)
        })?;
    }
    let bytes = serde_json::to_vec(artifact).map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "failed to serialize artifact").with_cause(err)
    })?;
    std::fs::write(path, bytes).map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "failed to write artifact").with_cause(err)
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiArtifactGetRequest {
    pub book_hash: String,
    pub kind: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiArtifactGetResponse {
    pub payload: Option<Value>,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiArtifactSetRequest {
    pub book_hash: String,
    pub kind: String,
    pub payload: Value,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiArtifactSetResponse {
    pub saved_at: String,
}

#[tauri::command(rename = "ai.artifact.get")]
pub fn ai_artifact_get(
    app: tauri::AppHandle,
    request: AiArtifactGetRequest,
) -> Result<AiArtifactGetResponse, AppError> {
    let path = artifact_path(&data_dir(&app)?, &request.book_hash, &request.kind)?;
    Ok(match load_artifact(&path)? {
        Some(stored) => AiArtifactGetResponse {
            payload: Some(stored.payload),
            created_at: Some(stored.created_at),
        },
        None => AiArtifactGetResponse {
            payload: None,
            created_at: None,
        },
    })
}

#[tauri::command(rename = "ai.artifact.set")]
pub fn ai_artifact_set(
    app: tauri::AppHandle,
    request: AiArtifactSetRequest,
) -> Result<AiArtifactSetResponse, AppError> {
    let path = artifact_path(&data_dir(&app)?, &request.book_hash, &request.kind)?;
    store_artifact(
        &path,
        &StoredArtifact {
            payload: request.payload,
            created_at: crate::timestamps::rfc3339_now(),
        },
    )?;
    Ok(AiArtifactSetResponse {
        saved_at: crate::timestamps::rfc3339_now(),
    })
}

pub fn index_path(base: &Path, book_hash: &str) -> Result<PathBuf, AppError> {
    crate::state::validate_hash(book_hash)?;
    Ok(base.join("ai-index").join(format!("{book_hash}.json")))
}

pub fn load_index(path: &Path) -> Result<Option<AiIndexPayload>, AppError> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => {
            return Err(
                AppError::new(ErrorCode::StorageIo, "failed to read ai index").with_cause(err),
            );
        }
    };
    if bytes.len() > MAX_INDEX_BYTES {
        return Err(AppError::new(
            ErrorCode::StorageCorrupt,
            "ai index is too large",
        ));
    }
    serde_json::from_slice(&bytes).map(Some).map_err(|err| {
        AppError::new(ErrorCode::StorageCorrupt, "ai index is corrupted").with_cause(err)
    })
}

pub fn store_index(path: &Path, index: &AiIndexPayload) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| {
            AppError::new(ErrorCode::StorageIo, "failed to create index directory").with_cause(err)
        })?;
    }
    let bytes = serde_json::to_vec(index).map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "failed to serialize ai index").with_cause(err)
    })?;
    std::fs::write(path, bytes).map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "failed to write ai index").with_cause(err)
    })
}

/// POST /embeddings through the provider and return the vectors.
pub async fn embed_texts(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    model: &str,
    texts: &[String],
) -> Result<Vec<Vec<f64>>, AppError> {
    let response = client
        .post(url)
        .bearer_auth(api_key)
        .json(&json!({ "model": model, "input": texts }))
        .send()
        .await
        .map_err(|err| {
            AppError::new(ErrorCode::AiProviderError, "无法连接 embeddings 服务")
                .with_cause(err)
                .retryable()
        })?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::new(
            ErrorCode::AiProviderError,
            format!("embeddings 服务返回错误({status})"),
        )
        .with_context("body", Value::String(text.chars().take(400).collect())));
    }
    let payload: Value = response.json().await.map_err(|err| {
        AppError::new(ErrorCode::AiProviderError, "embeddings 响应不是合法 JSON").with_cause(err)
    })?;
    let mut vectors: Vec<(usize, Vec<f64>)> = payload
        .get("data")
        .and_then(|data| data.as_array())
        .map(|array| {
            array
                .iter()
                .filter_map(|item| {
                    let index = item.get("index")?.as_u64()? as usize;
                    let embedding = item.get("embedding")?.as_array()?;
                    let vector: Vec<f64> = embedding
                        .iter()
                        .map(|value| value.as_f64().unwrap_or(0.0))
                        .collect();
                    Some((index, vector))
                })
                .collect()
        })
        .unwrap_or_default();
    vectors.sort_by_key(|(index, _)| *index);
    if vectors.len() != texts.len() {
        return Err(AppError::new(
            ErrorCode::AiProviderError,
            format!(
                "embeddings 数量不符:期望 {},实际 {}",
                texts.len(),
                vectors.len()
            ),
        ));
    }
    Ok(vectors.into_iter().map(|(_, vector)| vector).collect())
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

#[tauri::command(rename = "ai.embed")]
pub async fn ai_embed(
    app: tauri::AppHandle,
    secrets: State<'_, SecretStore>,
    request: AiEmbedRequest,
) -> Result<AiEmbedResponse, AppError> {
    let base = data_dir(&app)?;
    let config = load_configs(&base)
        .providers
        .into_iter()
        .find(|p| p.id == request.config_id)
        .ok_or_else(|| AppError::new(ErrorCode::AiProviderError, "AI 服务配置不存在"))?;
    let key = format!("ai.key.{}", request.config_id);
    let api_key = crate::secrets::get_secret(&secrets, &base, &key)?
        .ok_or_else(|| AppError::new(ErrorCode::AiProviderError, "请先填写该服务的 API Key"))?;
    let model = config
        .embedding_model
        .clone()
        .unwrap_or_else(|| config.model.clone());
    let url = format!("{}/embeddings", config.base_url.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let vectors = embed_texts(&client, &url, &api_key, &model, &request.texts).await?;
    Ok(AiEmbedResponse { vectors })
}

#[tauri::command(rename = "ai.index.get")]
pub fn ai_index_get(
    app: tauri::AppHandle,
    request: AiIndexGetRequest,
) -> Result<AiIndexGetResponse, AppError> {
    let path = index_path(&data_dir(&app)?, &request.book_hash)?;
    Ok(AiIndexGetResponse {
        index: load_index(&path)?,
    })
}

#[tauri::command(rename = "ai.index.set")]
pub fn ai_index_set(
    app: tauri::AppHandle,
    request: AiIndexSetRequest,
) -> Result<AiIndexSetResponse, AppError> {
    let path = index_path(&data_dir(&app)?, &request.book_hash)?;
    store_index(&path, &request.index)?;
    Ok(AiIndexSetResponse {
        saved_at: crate::timestamps::rfc3339_now(),
    })
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
    fn index_store_round_trips() {
        let base = std::env::temp_dir().join(format!(
            "reader-ai-index-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let hash = "23821135d4c62f1428fd15ddb9e91d695402727f43b13a6eb3e9f31fc01b4072";
        let path = index_path(&base, hash).unwrap();
        let index = AiIndexPayload {
            chunks: vec![AiIndexChunk {
                label: "第一章".into(),
                text: "镇上的人把灯点亮。".into(),
                vector: vec![0.1, 0.9],
            }],
            embedding_model: "mock-embedding".into(),
            created_at: "2026-09-13T00:00:00Z".into(),
        };
        store_index(&path, &index).unwrap();
        assert_eq!(load_index(&path).unwrap(), Some(index));
        assert!(index_path(&base, "../evil").is_err());
    }

    #[test]
    fn artifact_store_round_trips_and_rejects_bad_kinds() {
        let base = std::env::temp_dir().join(format!(
            "reader-ai-artifact-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let hash = "23821135d4c62f1428fd15ddb9e91d695402727f43b13a6eb3e9f31fc01b4072";
        let path = artifact_path(&base, hash, "summary").unwrap();
        let artifact = StoredArtifact {
            payload: json!({"overview": "雪季的故事", "themes": ["灯"]}),
            created_at: "2026-09-13T00:00:00Z".into(),
        };
        store_artifact(&path, &artifact).unwrap();
        assert_eq!(load_artifact(&path).unwrap(), Some(artifact));
        assert_eq!(load_artifact(&base.join("missing.json")).unwrap(), None);
        assert!(artifact_path(&base, hash, "evil").is_err());
        assert!(artifact_path(&base, "../../evil", "summary").is_err());
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
            embedding_model: None,
        };
        let mut store = load_configs(&base);
        assert!(store.providers.is_empty());
        store.providers.push(provider.clone());
        save_configs(&base, &store).unwrap();
        assert_eq!(load_configs(&base).providers, vec![provider]);
    }
}
