//! Per-book reader state (progress + annotations), persisted as one JSON file
//! keyed by the SHA-256 hash of the book file. SQLite lands in Sprint 3; this
//! is a real store, not a stub, and the hash keeps untrusted input away from
//! the filesystem.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::error::{AppError, ErrorCode};

pub const MAX_STATE_BYTES: usize = 4 * 1024 * 1024;

fn is_book_hash(hash: &str) -> bool {
    hash.len() == 64 && hash.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

pub fn validate_hash(hash: &str) -> Result<(), AppError> {
    if is_book_hash(hash) {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorCode::SystemValidation,
            "book hash must be a sha-256 hex digest",
        )
        .with_context("field", "bookHash"))
    }
}

pub fn state_path(base: &Path, hash: &str) -> Result<PathBuf, AppError> {
    validate_hash(hash)?;
    Ok(base.join("reader-state").join(format!("{hash}.json")))
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredProgress {
    pub cfi: String,
    pub fraction: f64,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredAnnotation {
    pub id: String,
    pub cfi: String,
    pub color: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub excerpt: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredBookmark {
    pub id: String,
    pub cfi: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReaderState {
    #[serde(default)]
    pub progress: Option<StoredProgress>,
    #[serde(default)]
    pub annotations: Vec<StoredAnnotation>,
    #[serde(default)]
    pub bookmarks: Vec<StoredBookmark>,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StateGetRequest {
    pub book_hash: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StateGetResponse {
    pub state: Option<ReaderState>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StateSetRequest {
    pub book_hash: String,
    pub state: ReaderState,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StateSetResponse {
    pub saved_at: String,
}

pub fn load_state(path: &Path) -> Result<Option<ReaderState>, AppError> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => {
            return Err(
                AppError::new(ErrorCode::StorageIo, "failed to read reader state")
                    .with_cause(err)
                    .retryable(),
            );
        }
    };
    if bytes.len() > MAX_STATE_BYTES {
        return Err(
            AppError::new(ErrorCode::StorageCorrupt, "reader state file is too large")
                .with_context("path", path.display().to_string()),
        );
    }
    serde_json::from_slice(&bytes).map(Some).map_err(|err| {
        AppError::new(ErrorCode::StorageCorrupt, "reader state file is corrupted")
            .with_cause(err)
            .with_context("path", path.display().to_string())
    })
}

pub fn store_state(path: &Path, state: &ReaderState) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| {
            AppError::new(ErrorCode::StorageIo, "failed to create state directory").with_cause(err)
        })?;
    }
    let bytes = serde_json::to_vec(state).map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "failed to serialize reader state").with_cause(err)
    })?;
    std::fs::write(path, bytes).map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "failed to write reader state").with_cause(err)
    })
}

#[tauri::command(rename = "reader.state.get")]
pub fn reader_state_get(
    app: tauri::AppHandle,
    request: StateGetRequest,
) -> Result<StateGetResponse, AppError> {
    let base = app.path().app_data_dir().map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "app data directory unavailable").with_cause(err)
    })?;
    let path = state_path(&base, &request.book_hash)?;
    Ok(StateGetResponse {
        state: load_state(&path)?,
    })
}

#[tauri::command(rename = "reader.state.set")]
pub fn reader_state_set(
    app: tauri::AppHandle,
    request: StateSetRequest,
) -> Result<StateSetResponse, AppError> {
    let base = app.path().app_data_dir().map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "app data directory unavailable").with_cause(err)
    })?;
    let path = state_path(&base, &request.book_hash)?;
    store_state(&path, &request.state)?;
    Ok(StateSetResponse {
        saved_at: crate::timestamps::rfc3339_now(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_base(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "reader-state-test-{tag}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    const HASH: &str = "23821135d4c62f1428fd15ddb9e91d695402727f43b13a6eb3e9f31fc01b4072";

    #[test]
    fn rejects_malformed_hashes_before_touching_the_filesystem() {
        assert!(validate_hash(HASH).is_ok());
        assert!(validate_hash("").is_err());
        assert!(validate_hash("ABCDEF").is_err());
        assert!(validate_hash(&HASH[..63]).is_err());
        assert!(validate_hash("../etc/passwd\u{0}00000000000000000000000000000000").is_err());
    }

    #[test]
    fn state_path_stays_inside_the_base_directory() {
        let base = Path::new("/tmp/some-base");
        let path = state_path(base, HASH).unwrap();
        assert_eq!(path, base.join("reader-state").join(format!("{HASH}.json")));
        assert!(state_path(base, "../../evil").is_err());
    }

    #[test]
    fn store_and_load_round_trip() {
        let base = temp_base("round-trip");
        let path = state_path(&base, HASH).unwrap();
        let state = ReaderState {
            progress: Some(StoredProgress {
                cfi: "epubcfi(/6/4)".into(),
                fraction: 0.42,
            }),
            annotations: vec![StoredAnnotation {
                id: "a1".into(),
                cfi: "epubcfi(/6/4!2/2)".into(),
                color: "#f5d76e".into(),
                note: None,
                excerpt: Some("被高亮的句子".into()),
            }],
            bookmarks: vec![StoredBookmark {
                id: "bm1".into(),
                cfi: "epubcfi(/6/4)".into(),
                label: Some("第一章".into()),
                created_at: "2026-09-09T00:00:00Z".into(),
            }],
            updated_at: "2026-09-09T00:00:00Z".into(),
        };

        store_state(&path, &state).unwrap();
        assert_eq!(load_state(&path).unwrap(), Some(state));
    }

    #[test]
    fn load_returns_none_for_missing_state() {
        let base = temp_base("missing");
        let path = state_path(&base, HASH).unwrap();
        assert_eq!(load_state(&path).unwrap(), None);
    }

    #[test]
    fn load_flags_corrupted_state_instead_of_crashing() {
        let base = temp_base("corrupt");
        let path = state_path(&base, HASH).unwrap();
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, b"{not json").unwrap();
        let err = load_state(&path).expect_err("corrupt state must error");
        assert_eq!(err.code.as_str(), "STORAGE_CORRUPT");
    }

    #[test]
    fn wire_shapes_are_camel_case() {
        let response = StateSetResponse {
            saved_at: "2026-09-09T00:00:00Z".into(),
        };
        let json = serde_json::to_value(&response).unwrap();
        assert_eq!(json["savedAt"], "2026-09-09T00:00:00Z");

        let state = ReaderState {
            progress: Some(StoredProgress {
                cfi: "x".into(),
                fraction: 1.0,
            }),
            annotations: vec![],
            bookmarks: vec![],
            updated_at: "2026-09-09T00:00:00Z".into(),
        };
        let json = serde_json::to_value(&state).unwrap();
        assert!(json.get("progress").is_some());
        assert_eq!(json["updatedAt"], "2026-09-09T00:00:00Z");

        // Old state files without bookmarks still load (serde default).
        let legacy: ReaderState =
            serde_json::from_str(r#"{"updatedAt":"2026-01-01T00:00:00Z"}"#).unwrap();
        assert!(legacy.bookmarks.is_empty());
        let json = serde_json::to_value(&legacy).unwrap();
        assert_eq!(json["bookmarks"], serde_json::Value::Array(vec![]));
    }
}
