//! StarDict dictionaries: registered by picking the `.ifo` file; the sibling
//! `.idx` / `.dict(.dz)` files are located and allowed on the asset protocol.
//! Files stay at their original location; parsing happens in the frontend
//! (see `packages/reader-adapter/src/dictionary/stardict.ts`).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Manager;

use crate::error::{AppError, ErrorCode};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryMeta {
    pub id: String,
    pub name: String,
    pub word_count: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sametypesequence: Option<String>,
    pub ifo_path: String,
    pub idx_path: String,
    pub dict_path: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DictionaryStore {
    #[serde(default)]
    dictionaries: Vec<DictionaryMeta>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DictionaryRegisterRequest {
    pub path: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryListResponse {
    pub dictionaries: Vec<DictionaryMeta>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryRegisterResponse {
    pub dictionary: DictionaryMeta,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DictionaryRemoveRequest {
    pub id: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryRemoveResponse {
    pub removed: bool,
}

fn dictionary_store_path(base: &Path) -> PathBuf {
    base.join("dictionaries.json")
}

fn load_store(base: &Path) -> Result<DictionaryStore, AppError> {
    let bytes = match std::fs::read(dictionary_store_path(base)) {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Ok(DictionaryStore::default());
        }
        Err(err) => {
            return Err(
                AppError::new(ErrorCode::StorageIo, "failed to read dictionaries").with_cause(err),
            );
        }
    };
    serde_json::from_slice(&bytes).map_err(|err| {
        AppError::new(ErrorCode::StorageCorrupt, "dictionary store is corrupted").with_cause(err)
    })
}

fn save_store(base: &Path, store: &DictionaryStore) -> Result<(), AppError> {
    std::fs::create_dir_all(base).map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "failed to create data directory").with_cause(err)
    })?;
    let bytes = serde_json::to_vec_pretty(store).map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "failed to serialize dictionaries").with_cause(err)
    })?;
    std::fs::write(dictionary_store_path(base), bytes).map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "failed to write dictionaries").with_cause(err)
    })
}

/// Minimal `.ifo` parse: `key=value` lines; we need bookname, wordcount and
/// sametypesequence. Everything else is the frontend's concern.
pub fn parse_ifo(text: &str) -> Result<(String, u64, Option<String>), AppError> {
    let mut bookname: Option<String> = None;
    let mut wordcount: Option<u64> = None;
    let mut sametypesequence: Option<String> = None;
    for line in text.lines() {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        match key.trim() {
            "bookname" => bookname = Some(value.trim().to_string()),
            "wordcount" => wordcount = value.trim().parse::<u64>().ok(),
            "sametypesequence" => sametypesequence = Some(value.trim().to_string()),
            _ => {}
        }
    }
    match (bookname, wordcount) {
        (Some(name), Some(count)) => Ok((name, count, sametypesequence)),
        (None, _) => Err(AppError::new(
            ErrorCode::SystemValidation,
            "ifo is missing bookname",
        )),
        (_, None) => Err(AppError::new(
            ErrorCode::SystemValidation,
            "ifo is missing wordcount",
        )),
    }
}

fn sibling_with_extension(ifo_path: &Path, extension: &str) -> Option<PathBuf> {
    let stem = ifo_path.file_stem()?;
    let parent = ifo_path.parent()?;
    let mut name = stem.to_string_lossy().to_string();
    name.push_str(extension);
    let candidate = parent.join(name);
    candidate.exists().then_some(candidate)
}

/// Register flow shared by the command: validate the `.ifo`, require the
/// sibling `.idx` and `.dict(.dz)`, allow all three on the asset protocol.
pub fn register_dictionary(
    base: &Path,
    raw_path: &str,
    allow_asset: &dyn Fn(&Path) -> Result<(), AppError>,
) -> Result<DictionaryMeta, AppError> {
    let ifo_path = PathBuf::from(raw_path);
    if ifo_path.extension().map(|e| e != "ifo").unwrap_or(true) {
        return Err(AppError::new(
            ErrorCode::SystemValidation,
            "请选择 .ifo 词典文件",
        ));
    }
    let (name, word_count, sametypesequence) =
        parse_ifo(&std::fs::read_to_string(&ifo_path).map_err(|err| {
            AppError::new(ErrorCode::BookOpenFailed, "无法读取词典 .ifo").with_cause(err)
        })?)?;
    let idx = sibling_with_extension(&ifo_path, ".idx")
        .or_else(|| sibling_with_extension(&ifo_path, ".idx.gz"))
        .or_else(|| sibling_with_extension(&ifo_path, ".idx.dz"))
        .ok_or_else(|| AppError::new(ErrorCode::BookOpenFailed, "缺少同名的 .idx 索引文件"))?;
    let dict = sibling_with_extension(&ifo_path, ".dict")
        .or_else(|| sibling_with_extension(&ifo_path, ".dict.dz"))
        .or_else(|| sibling_with_extension(&ifo_path, ".dict.gz"))
        .ok_or_else(|| AppError::new(ErrorCode::BookOpenFailed, "缺少同名的 .dict 词典文件"))?;

    for path in [&ifo_path, &idx, &dict] {
        allow_asset(path)?;
    }

    let mut hasher = Sha256::new();
    hasher.update(raw_path.as_bytes());
    let id: String = hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();

    let meta = DictionaryMeta {
        id: id[..32].to_string(),
        name,
        word_count,
        sametypesequence,
        ifo_path: raw_path.to_string(),
        idx_path: idx.to_string_lossy().to_string(),
        dict_path: dict.to_string_lossy().to_string(),
    };
    let mut store = load_store(base)?;
    store.dictionaries.retain(|d| d.id != meta.id);
    store.dictionaries.push(meta.clone());
    save_store(base, &store)?;
    Ok(meta)
}

pub fn list_dictionaries(base: &Path) -> Result<Vec<DictionaryMeta>, AppError> {
    let mut dictionaries = load_store(base)?.dictionaries;
    dictionaries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(dictionaries)
}

pub fn remove_dictionary(base: &Path, id: &str) -> Result<bool, AppError> {
    let mut store = load_store(base)?;
    let before = store.dictionaries.len();
    store.dictionaries.retain(|d| d.id != id);
    let removed = store.dictionaries.len() != before;
    if removed {
        save_store(base, &store)?;
    }
    Ok(removed)
}

pub fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    app.path().app_data_dir().map_err(|err| {
        AppError::new(ErrorCode::StorageIo, "app data directory unavailable").with_cause(err)
    })
}

#[tauri::command(rename = "dictionary.list")]
pub fn dictionary_list(app: tauri::AppHandle) -> Result<DictionaryListResponse, AppError> {
    Ok(DictionaryListResponse {
        dictionaries: list_dictionaries(&data_dir(&app)?)?,
    })
}

#[tauri::command(rename = "dictionary.register")]
pub fn dictionary_register(
    app: tauri::AppHandle,
    request: DictionaryRegisterRequest,
) -> Result<DictionaryRegisterResponse, AppError> {
    let base = data_dir(&app)?;
    let dictionary = register_dictionary(&base, &request.path, &|path| {
        app.asset_protocol_scope().allow_file(path).map_err(|err| {
            AppError::new(
                ErrorCode::SecurityValidationFailed,
                "failed to allow dict path",
            )
            .with_cause(err)
        })
    })?;
    Ok(DictionaryRegisterResponse { dictionary })
}

#[tauri::command(rename = "dictionary.remove")]
pub fn dictionary_remove(
    app: tauri::AppHandle,
    request: DictionaryRemoveRequest,
) -> Result<DictionaryRemoveResponse, AppError> {
    Ok(DictionaryRemoveResponse {
        removed: remove_dictionary(&data_dir(&app)?, &request.id)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_base(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "reader-dict-test-{tag}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn no_asset(_path: &Path) -> Result<(), AppError> {
        Ok(())
    }

    #[test]
    fn parses_ifo_metadata() {
        let ifo = "StarDict's dict ifo file\nversion=2.4.2\nbookname=测试词典\nwordcount=1234\nsametypesequence=h\n";
        let (name, count, seq) = parse_ifo(ifo).unwrap();
        assert_eq!(name, "测试词典");
        assert_eq!(count, 1234);
        assert_eq!(seq.as_deref(), Some("h"));
    }

    #[test]
    fn ifo_without_bookname_is_rejected() {
        assert!(parse_ifo("version=2.4.2\nwordcount=1\n").is_err());
    }

    #[test]
    fn register_requires_idx_and_dict_siblings() {
        let base = temp_base("siblings");
        let ifo = base.join("test.ifo");
        std::fs::write(&ifo, "bookname=T\nwordcount=1\n").unwrap();
        assert!(register_dictionary(&base, ifo.to_str().unwrap(), &no_asset).is_err());

        std::fs::write(base.join("test.idx"), b"").unwrap();
        assert!(register_dictionary(&base, ifo.to_str().unwrap(), &no_asset).is_err());

        std::fs::write(base.join("test.dict.dz"), b"").unwrap();
        let meta = register_dictionary(&base, ifo.to_str().unwrap(), &no_asset).unwrap();
        assert_eq!(meta.name, "T");
        assert_eq!(meta.word_count, 1);
    }

    #[test]
    fn non_ifo_paths_are_rejected() {
        let base = temp_base("nonifo");
        let txt = base.join("test.txt");
        std::fs::write(&txt, "x").unwrap();
        let err = register_dictionary(&base, txt.to_str().unwrap(), &no_asset)
            .expect_err("non-ifo must be rejected");
        assert_eq!(err.code.as_str(), "SYSTEM_VALIDATION");
    }

    #[test]
    fn list_remove_round_trip() {
        let base = temp_base("roundtrip");
        let ifo = base.join("d.ifo");
        std::fs::write(&ifo, "bookname=词典A\nwordcount=10\n").unwrap();
        std::fs::write(base.join("d.idx"), b"").unwrap();
        std::fs::write(base.join("d.dict"), b"").unwrap();
        let meta = register_dictionary(&base, ifo.to_str().unwrap(), &no_asset).unwrap();

        assert_eq!(list_dictionaries(&base).unwrap(), vec![meta.clone()]);
        assert!(remove_dictionary(&base, &meta.id).unwrap());
        assert!(list_dictionaries(&base).unwrap().is_empty());
    }

    #[test]
    fn register_is_an_upsert_by_path() {
        let base = temp_base("upsert");
        let ifo = base.join("d.ifo");
        std::fs::write(&ifo, "bookname=词典A\nwordcount=10\n").unwrap();
        std::fs::write(base.join("d.idx"), b"").unwrap();
        std::fs::write(base.join("d.dict"), b"").unwrap();
        register_dictionary(&base, ifo.to_str().unwrap(), &no_asset).unwrap();
        register_dictionary(&base, ifo.to_str().unwrap(), &no_asset).unwrap();
        assert_eq!(list_dictionaries(&base).unwrap().len(), 1);
    }
}
