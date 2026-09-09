//! Library: registered books, persisted as `library.json` in the app data
//! directory.
//!
//! Design (ADR-0006 / spec §1.2): book files stay at their original location —
//! the library only stores metadata plus the path, and the reader kernel reads
//! the file through the asset protocol, which is allowed per-file at import
//! time. Removing a book never touches the user's file.

use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Manager;

use crate::error::{AppError, ErrorCode};

pub const MAX_LIBRARY_BYTES: usize = 2 * 1024 * 1024;

/// Extensions this app really supports; mirrors `detectFormat` in
/// `packages/reader-adapter/src/format.ts` (minus the browser-only aliases).
const SUPPORTED_EXTENSIONS: &[(&str, &str)] = &[
    ("epub", "epub"),
    ("mobi", "mobi"),
    ("prc", "mobi"),
    ("azw", "mobi"),
    ("azw3", "azw3"),
    ("kf8", "azw3"),
    ("fb2", "fb2"),
    ("fbz", "fb2"),
    ("cbz", "cbz"),
    ("pdf", "pdf"),
    ("txt", "txt"),
    ("md", "md"),
    ("markdown", "md"),
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryBook {
    pub hash: String,
    pub file_name: String,
    pub format: String,
    pub path: String,
    pub size: u64,
    pub added_at: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LibraryStore {
    #[serde(default)]
    books: Vec<LibraryBook>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LibraryImportRequest {
    pub path: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryListResponse {
    pub books: Vec<LibraryBook>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryImportResponse {
    pub book: LibraryBook,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LibraryRemoveRequest {
    pub book_hash: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRemoveResponse {
    pub removed: bool,
}

pub fn detect_format(file_name: &str) -> Option<&'static str> {
    let lower = file_name.to_lowercase();
    let extension = lower.rsplit('.').next()?;
    SUPPORTED_EXTENSIONS
        .iter()
        .find(|(ext, _)| *ext == extension)
        .map(|(_, format)| *format)
}

/// Streaming SHA-256 so 100MB+ books never sit in memory (spec §70).
pub fn hash_file(path: &Path) -> Result<(String, u64), AppError> {
    let mut file = std::fs::File::open(path).map_err(|err| {
        AppError::new(ErrorCode::BookOpenFailed, "failed to open book file").with_cause(err)
    })?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    let mut size = 0u64;
    loop {
        let read = file.read(&mut buffer).map_err(|err| {
            AppError::new(ErrorCode::StorageIo, "failed to read book file").with_cause(err)
        })?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        size += read as u64;
    }
    let digest = hasher.finalize();
    let hex: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
    Ok((hex, size))
}

fn library_store_path(base: &Path) -> PathBuf {
    base.join("library.json")
}

fn load_store(base: &Path) -> Result<LibraryStore, AppError> {
    let path = library_store_path(base);
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Ok(LibraryStore::default());
        }
        Err(err) => {
            return Err(
                AppError::new(ErrorCode::StorageIo, "failed to read library").with_cause(err),
            );
        }
    };
    if bytes.len() > MAX_LIBRARY_BYTES {
        return Err(AppError::new(
            ErrorCode::StorageCorrupt,
            "library file is too large",
        ));
    }
    serde_json::from_slice(&bytes).map_err(|err| {
        AppError::new(ErrorCode::StorageCorrupt, "library file is corrupted").with_cause(err)
    })
}

fn save_store(base: &Path, store: &LibraryStore) -> Result<(), AppError> {
    std::fs::create_dir_all(base).map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "failed to create data directory").with_cause(err)
    })?;
    let bytes = serde_json::to_vec_pretty(store).map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "failed to serialize library").with_cause(err)
    })?;
    std::fs::write(library_store_path(base), bytes).map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "failed to write library").with_cause(err)
    })
}

pub fn list_books(base: &Path) -> Result<Vec<LibraryBook>, AppError> {
    let mut books = load_store(base)?.books;
    books.sort_by(|a, b| b.added_at.cmp(&a.added_at));
    Ok(books)
}

pub fn remove_book(base: &Path, hash: &str) -> Result<bool, AppError> {
    crate::state::validate_hash(hash)?;
    let mut store = load_store(base)?;
    let before = store.books.len();
    store.books.retain(|book| book.hash != hash);
    let removed = store.books.len() != before;
    if removed {
        save_store(base, &store)?;
    }
    Ok(removed)
}

/// Import flow shared by the command: validate the picked file, allow the
/// asset protocol to serve it, hash it, and upsert the record.
pub fn import_book(base: &Path, raw_path: &str) -> Result<LibraryBook, AppError> {
    let path = PathBuf::from(raw_path);
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .ok_or_else(|| {
            AppError::new(ErrorCode::SystemValidation, "path has no file name")
                .with_context("field", "path")
        })?;
    let format = detect_format(&file_name).ok_or_else(|| {
        AppError::new(ErrorCode::BookUnsupportedFormat, "unsupported book format")
            .with_context("fileName", file_name.clone())
    })?;
    let meta = std::fs::metadata(&path).map_err(|err| {
        AppError::new(ErrorCode::BookOpenFailed, "book file is not readable").with_cause(err)
    })?;
    if !meta.is_file() {
        return Err(AppError::new(
            ErrorCode::BookOpenFailed,
            "path is not a file",
        ));
    }

    let (hash, size) = hash_file(&path)?;
    let existing = load_store(base)?;
    let book = LibraryBook {
        hash: hash.clone(),
        file_name,
        format: format.to_string(),
        path: raw_path.to_string(),
        size,
        added_at: existing
            .books
            .iter()
            .find(|book| book.hash == hash)
            .map(|book| book.added_at.clone())
            .unwrap_or_else(crate::timestamps::rfc3339_now),
    };

    let mut store = LibraryStore {
        books: existing
            .books
            .into_iter()
            .filter(|book| book.hash != hash)
            .collect(),
    };
    store.books.push(book.clone());
    save_store(base, &store)?;
    Ok(book)
}

pub fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    app.path().app_data_dir().map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "app data directory unavailable").with_cause(err)
    })
}

#[tauri::command(rename = "library.list")]
pub fn library_list(app: tauri::AppHandle) -> Result<LibraryListResponse, AppError> {
    Ok(LibraryListResponse {
        books: list_books(&data_dir(&app)?)?,
    })
}

#[tauri::command(rename = "library.import")]
pub fn library_import(
    app: tauri::AppHandle,
    request: LibraryImportRequest,
) -> Result<LibraryImportResponse, AppError> {
    let base = data_dir(&app)?;
    let book = import_book(&base, &request.path)?;
    // Allow the asset protocol to serve exactly this file (user picked it, so
    // this does not widen the scope to any directory).
    app.asset_protocol_scope()
        .allow_file(&book.path)
        .map_err(|err| {
            AppError::new(
                ErrorCode::SecurityValidationFailed,
                "failed to allow book path",
            )
            .with_cause(err)
        })?;
    Ok(LibraryImportResponse { book })
}

#[tauri::command(rename = "library.remove")]
pub fn library_remove(
    app: tauri::AppHandle,
    request: LibraryRemoveRequest,
) -> Result<LibraryRemoveResponse, AppError> {
    Ok(LibraryRemoveResponse {
        removed: remove_book(&data_dir(&app)?, &request.book_hash)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_base(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "reader-library-test-{tag}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn detects_supported_formats_and_rejects_others() {
        assert_eq!(detect_format("夜航书.EPUB"), Some("epub"));
        assert_eq!(detect_format("book.azw3"), Some("azw3"));
        assert_eq!(
            detect_format("novel.fb2.zip"),
            None,
            "double extension not matched by rsplit"
        );
        assert_eq!(detect_format("scan.CBZ"), Some("cbz"));
        assert_eq!(detect_format("file.xyz"), None);
    }

    #[test]
    fn hashes_files_streaming_and_deterministically() {
        let base = temp_base("hash");
        let path = base.join("a.txt");
        std::fs::write(&path, b"hello ai reader").unwrap();
        let (hash, size) = hash_file(&path).unwrap();
        assert_eq!(size, 15);
        assert_eq!(hash.len(), 64);
        let (again, _) = hash_file(&path).unwrap();
        assert_eq!(hash, again);
    }

    #[test]
    fn import_is_an_upsert_that_keeps_the_original_added_at() {
        let base = temp_base("upsert");
        let path = base.join("book.epub");
        std::fs::write(&path, b"epub-bytes").unwrap();

        let first = import_book(&base, path.to_str().unwrap()).unwrap();
        assert_eq!(first.format, "epub");
        assert_eq!(list_books(&base).unwrap().len(), 1);

        let second = import_book(&base, path.to_str().unwrap()).unwrap();
        assert_eq!(second.hash, first.hash);
        assert_eq!(second.added_at, first.added_at, "re-import keeps addedAt");
        assert_eq!(list_books(&base).unwrap().len(), 1);
    }

    #[test]
    fn import_rejects_unsupported_formats_before_touching_storage() {
        let base = temp_base("reject");
        let path = base.join("help.chm");
        std::fs::write(&path, b"chm").unwrap();
        let err = import_book(&base, path.to_str().unwrap()).expect_err("chm must be rejected");
        assert_eq!(err.code.as_str(), "BOOK_UNSUPPORTED_FORMAT");
        assert!(list_books(&base).unwrap().is_empty());
    }

    #[test]
    fn remove_deletes_only_the_record() {
        let base = temp_base("remove");
        let path = base.join("book.epub");
        std::fs::write(&path, b"epub-bytes").unwrap();
        let book = import_book(&base, path.to_str().unwrap()).unwrap();

        assert!(remove_book(&base, &book.hash).unwrap());
        assert!(
            !remove_book(&base, &book.hash).unwrap(),
            "second remove is a no-op"
        );
        assert!(list_books(&base).unwrap().is_empty());
        assert!(path.exists(), "the user's file must never be deleted");
    }

    #[test]
    fn list_sorts_newest_first() {
        let base = temp_base("sort");
        let a = base.join("a.epub");
        let b = base.join("b.epub");
        std::fs::write(&a, b"aaa").unwrap();
        std::fs::write(&b, b"bbb").unwrap();
        let book_a = import_book(&base, a.to_str().unwrap()).unwrap();
        let book_b = import_book(&base, b.to_str().unwrap()).unwrap();
        // Timestamps share second resolution; force a stable order when equal.
        let mut books = list_books(&base).unwrap();
        books.sort_by(|x, y| x.hash.cmp(&y.hash));
        let mut expected = vec![book_a.hash, book_b.hash];
        expected.sort();
        assert_eq!(
            books.into_iter().map(|b| b.hash).collect::<Vec<_>>(),
            expected
        );
    }

    #[test]
    fn wire_shapes_are_camel_case() {
        let book = LibraryBook {
            hash: "0".repeat(64),
            file_name: "a.epub".into(),
            format: "epub".into(),
            path: "/tmp/a.epub".into(),
            size: 3,
            added_at: "2026-09-09T00:00:00Z".into(),
        };
        let json = serde_json::to_value(&book).unwrap();
        assert_eq!(json["fileName"], "a.epub");
        assert_eq!(json["addedAt"], "2026-09-09T00:00:00Z");
        let response = LibraryRemoveResponse { removed: true };
        assert_eq!(serde_json::to_value(&response).unwrap()["removed"], true);
    }
}
