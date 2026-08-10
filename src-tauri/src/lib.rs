// Klickrr Edit — Tauri backend.
// Kept intentionally thin: native open/save pickers come from the dialog plugin
// (invoked from the frontend), and these two commands do the actual disk I/O for
// whatever absolute path the picker returns. This avoids the fs-plugin scoping
// dance while still confining reads/writes to user-chosen files.

use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use std::sync::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri::ipc::Channel;

/// Read a file as text. Unlike `read_to_string`, this never fails on content:
/// non-UTF-8 bytes are decoded lossily (invalid sequences become U+FFFD) so the
/// editor can open ANY file regardless of its type or encoding — matching
/// A desktop editor opens whatever you point it at. Only I/O errors (missing
/// file, permission) surface as an `Err`.
#[derive(Serialize)]
struct TextFile {
    contents: String,
    encoding: String,
    line_ending: String,
    modified_ms: u64,
    size: u64,
    large: bool,
}

#[derive(Default, Serialize)]
struct EditorConfigResult {
    indent_style: Option<String>, indent_size: Option<usize>, tab_width: Option<usize>,
    end_of_line: Option<String>, charset: Option<String>, trim_trailing_whitespace: Option<bool>,
    insert_final_newline: Option<bool>, source: Option<String>,
}

// Resolve the nearest applicable .editorconfig files, from filesystem root to
// the document. This intentionally implements the common properties without
// adding a heavyweight parser dependency.
#[tauri::command]
fn resolve_editor_config(path: String) -> EditorConfigResult {
    let target = Path::new(&path); let mut configs: Vec<(PathBuf, String)> = vec![]; let mut at = target.parent();
    while let Some(dir) = at { let config_path = dir.join(".editorconfig"); if let Ok(text) = fs::read_to_string(&config_path) { let is_root = text.lines().any(|l| l.trim().eq_ignore_ascii_case("root = true")); configs.push((config_path, text)); if is_root { break; } } at = dir.parent(); }
    configs.reverse(); let filename = target.file_name().and_then(|v| v.to_str()).unwrap_or("");
    let mut result = EditorConfigResult::default();
    for (config_path, text) in configs {
        let mut applies = false;
        for raw in text.lines() {
            let line = raw.trim(); if line.is_empty() || line.starts_with(['#', ';']) { continue; }
            if line.starts_with('[') && line.ends_with(']') {
                let pat = &line[1..line.len()-1]; applies = pat == "*" || pat == "**" || pat.split(',').any(|p| {
                    let p = p.trim().trim_matches('{').trim_matches('}');
                    if let Some(ext) = p.strip_prefix("*.") { filename.ends_with(&format!(".{ext}")) } else { p == filename }
                }); continue;
            }
            if !applies { continue; } let Some((key, value)) = line.split_once('=') else { continue }; let key = key.trim(); let value = value.trim().to_lowercase();
            match key {
                "indent_style" => result.indent_style = Some(value),
                "indent_size" => if value != "tab" { result.indent_size = value.parse().ok() },
                "tab_width" => result.tab_width = value.parse().ok(),
                "end_of_line" => result.end_of_line = Some(value), "charset" => result.charset = Some(value),
                "trim_trailing_whitespace" => result.trim_trailing_whitespace = Some(value == "true"),
                "insert_final_newline" => result.insert_final_newline = Some(value == "true"), _ => {}
            }
            result.source = Some(config_path.to_string_lossy().to_string());
        }
    } result
}

fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified().ok().and_then(|v| v.duration_since(UNIX_EPOCH).ok())
        .map(|v| v.as_millis() as u64).unwrap_or(0)
}

fn decode_text(data: &[u8]) -> (String, &'static str) {
    if data.starts_with(&[0xef, 0xbb, 0xbf]) {
        return (String::from_utf8_lossy(&data[3..]).into_owned(), "utf-8-bom");
    }
    if data.starts_with(&[0xff, 0xfe]) {
        let units: Vec<u16> = data[2..].chunks_exact(2)
            .map(|b| u16::from_le_bytes([b[0], b[1]])).collect();
        return (String::from_utf16_lossy(&units), "utf-16le");
    }
    if data.starts_with(&[0xfe, 0xff]) {
        let units: Vec<u16> = data[2..].chunks_exact(2)
            .map(|b| u16::from_be_bytes([b[0], b[1]])).collect();
        return (String::from_utf16_lossy(&units), "utf-16be");
    }
    if let Ok(s) = String::from_utf8(data.to_vec()) {
        let enc = if data.is_ascii() { "ascii" } else { "utf-8" };
        return (s, enc);
    }
    // Windows-1252 is the most useful legacy fallback for source and text files.
    let s: String = data.iter().map(|&b| match b {
        0x80 => '\u{20ac}', 0x82 => '\u{201a}', 0x83 => '\u{0192}',
        0x84 => '\u{201e}', 0x85 => '\u{2026}', 0x86 => '\u{2020}',
        0x87 => '\u{2021}', 0x88 => '\u{02c6}', 0x89 => '\u{2030}',
        0x8a => '\u{0160}', 0x8b => '\u{2039}', 0x8c => '\u{0152}',
        0x8e => '\u{017d}', 0x91 => '\u{2018}', 0x92 => '\u{2019}',
        0x93 => '\u{201c}', 0x94 => '\u{201d}', 0x95 => '\u{2022}',
        0x96 => '\u{2013}', 0x97 => '\u{2014}', 0x98 => '\u{02dc}',
        0x99 => '\u{2122}', 0x9a => '\u{0161}', 0x9b => '\u{203a}',
        0x9c => '\u{0153}', 0x9e => '\u{017e}', 0x9f => '\u{0178}',
        _ => char::from_u32(b as u32).unwrap_or('\u{fffd}'),
    }).collect();
    (s, "windows-1252")
}

fn decode_as(data: &[u8], encoding: &str) -> Result<String, String> {
    match encoding {
        "utf-8" | "ascii" => String::from_utf8(data.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(data).to_vec()).map_err(|e| e.to_string()),
        "utf-8-bom" => Ok(String::from_utf8_lossy(data.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(data)).into_owned()),
        "utf-16le" | "utf-16be" => { let raw = if encoding == "utf-16le" { data.strip_prefix(&[0xff, 0xfe]).unwrap_or(data) } else { data.strip_prefix(&[0xfe, 0xff]).unwrap_or(data) };
            let units: Vec<u16> = raw.chunks_exact(2).map(|b| if encoding == "utf-16le" { u16::from_le_bytes([b[0], b[1]]) } else { u16::from_be_bytes([b[0], b[1]]) }).collect(); Ok(String::from_utf16_lossy(&units)) }
        "windows-1252" => Ok(decode_text(data).0),
        _ => Err(format!("Unsupported encoding: {encoding}")),
    }
}

fn line_ending(text: &str) -> &'static str {
    if text.contains("\r\n") { "crlf" } else if text.contains('\r') { "cr" } else { "lf" }
}

#[tauri::command]
fn read_text_file(path: String, encoding: Option<String>) -> Result<TextFile, String> {
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    let large = meta.len() > 16 * 1024 * 1024;
    let data = if large { let file = fs::File::open(&path).map_err(|e| e.to_string())?; let mut out = vec![];
        file.take(4 * 1024 * 1024).read_to_end(&mut out).map_err(|e| e.to_string())?; out }
        else { fs::read(&path).map_err(|e| format!("Could not read {path}: {e}"))? };
    let (raw, detected) = if let Some(ref requested) = encoding { (decode_as(&data, requested)?, requested.as_str()) } else { decode_text(&data) };
    let ending = line_ending(&raw).to_string();
    let contents = raw.replace("\r\n", "\n").replace('\r', "\n");
    Ok(TextFile { contents, encoding: detected.into(), line_ending: ending,
        modified_ms: modified_ms(&meta), size: meta.len(), large })
}

fn encode_text(contents: &str, encoding: &str) -> Result<Vec<u8>, String> {
    match encoding {
        "utf-8" => Ok(contents.as_bytes().to_vec()),
        "utf-8-bom" => Ok([&[0xef, 0xbb, 0xbf][..], contents.as_bytes()].concat()),
        "ascii" => {
            if !contents.is_ascii() { return Err("The document contains characters that ASCII cannot represent.".into()); }
            Ok(contents.as_bytes().to_vec())
        }
        "utf-16le" | "utf-16be" => {
            let mut out = if encoding == "utf-16le" { vec![0xff, 0xfe] } else { vec![0xfe, 0xff] };
            for unit in contents.encode_utf16() {
                out.extend(if encoding == "utf-16le" { unit.to_le_bytes() } else { unit.to_be_bytes() });
            }
            Ok(out)
        }
        "windows-1252" => {
            let mut out = Vec::with_capacity(contents.len());
            for ch in contents.chars() {
                let b = match ch { '\u{20ac}' => 0x80, '\u{201a}' => 0x82, '\u{0192}' => 0x83,
                    '\u{201e}' => 0x84, '\u{2026}' => 0x85, '\u{2020}' => 0x86,
                    '\u{2021}' => 0x87, '\u{02c6}' => 0x88, '\u{2030}' => 0x89,
                    '\u{0160}' => 0x8a, '\u{2039}' => 0x8b, '\u{0152}' => 0x8c,
                    '\u{017d}' => 0x8e, '\u{2018}' => 0x91, '\u{2019}' => 0x92,
                    '\u{201c}' => 0x93, '\u{201d}' => 0x94, '\u{2022}' => 0x95,
                    '\u{2013}' => 0x96, '\u{2014}' => 0x97, '\u{02dc}' => 0x98,
                    '\u{2122}' => 0x99, '\u{0161}' => 0x9a, '\u{203a}' => 0x9b,
                    '\u{0153}' => 0x9c, '\u{017e}' => 0x9e, '\u{0178}' => 0x9f,
                    c if (c as u32) <= 0xff => c as u8,
                    _ => return Err(format!("The character {ch:?} cannot be represented in Windows-1252.")),
                }; out.push(b);
            } Ok(out)
        }
        _ => Err(format!("Unsupported encoding: {encoding}")),
    }
}

/// Write through a sibling temporary file and rename it into place. A failed
/// save therefore leaves the last good file intact.
#[tauri::command]
fn write_text_file(path: String, contents: String, encoding: String, line_ending: String, backup: bool) -> Result<TextFile, String> {
    let disk_text = match line_ending.as_str() { "crlf" => contents.replace('\n', "\r\n"),
        "cr" => contents.replace('\n', "\r"), _ => contents.clone() };
    let bytes = encode_text(&disk_text, &encoding)?;
    if backup && Path::new(&path).exists() {
        fs::copy(&path, format!("{path}.bak")).map_err(|e| format!("Could not create backup: {e}"))?;
    }
    let target = Path::new(&path);
    let parent = target.parent().ok_or("The target has no parent folder.")?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let temp = parent.join(format!(".klickrr-save-{stamp}.tmp"));
    let result = (|| -> Result<(), String> {
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|e| e.to_string())?;
        file.write_all(&bytes).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
        if let Ok(meta) = fs::metadata(target) { let _ = fs::set_permissions(&temp, meta.permissions()); }
        fs::rename(&temp, target).map_err(|e| e.to_string())?;
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_file(&temp); }
    result.map_err(|e| format!("Could not save {path}: {e}"))?;
    read_text_file(path, None)
}

#[derive(Serialize)]
struct FileStat { modified_ms: u64, size: u64 }

#[tauri::command]
fn stat_file(path: String) -> Result<FileStat, String> {
    let m = fs::metadata(path).map_err(|e| e.to_string())?;
    Ok(FileStat { modified_ms: modified_ms(&m), size: m.len() })
}

#[derive(Serialize)]
struct TailFile { contents: String, size: u64, truncated: bool }

#[tauri::command]
fn tail_file(path: String, max: u64) -> Result<TailFile, String> {
    let mut file = fs::File::open(&path).map_err(|e| e.to_string())?; let size = file.metadata().map_err(|e| e.to_string())?.len();
    let start = size.saturating_sub(max); file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
    let mut data = vec![]; file.read_to_end(&mut data).map_err(|e| e.to_string())?;
    if start > 0 { if let Some(pos) = data.iter().position(|b| *b == b'\n') { data.drain(..=pos); } }
    Ok(TailFile { contents: decode_text(&data).0, size, truncated: start > 0 })
}

#[derive(Serialize)]
struct FileBytes {
    bytes: Vec<u8>,
    total: u64,
    truncated: bool,
}

/// Read up to `max` raw bytes of a file for the Hex Viewer (works on binary
/// files that `read_file` can't decode as UTF-8).
#[tauri::command]
fn read_file_bytes(path: String, max: usize) -> Result<FileBytes, String> {
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    let total = data.len() as u64;
    let truncated = data.len() > max;
    let bytes = if truncated { data[..max].to_vec() } else { data };
    Ok(FileBytes {
        bytes,
        total,
        truncated,
    })
}

#[tauri::command]
fn write_file_bytes(path: String, bytes: Vec<u8>, backup: bool) -> Result<(), String> {
    let target = Path::new(&path); if backup && target.exists() { fs::copy(target, format!("{path}.bak")).map_err(|e| e.to_string())?; }
    let parent = target.parent().ok_or("Invalid file path")?; let temp = parent.join(".klickrr-hex-save.tmp");
    fs::write(&temp, bytes).map_err(|e| e.to_string())?; fs::rename(temp, target).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

/// List a directory's contents (dotfiles hidden), directories first then files,
/// each group sorted case-insensitively. Powers the Directory sidebar.
#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut entries: Vec<DirEntry> = Vec::new();
    for entry in fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
        entries.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir,
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// The user's home directory (or "/" if $HOME is unset). Default Directory root.
#[tauri::command]
fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
}

#[derive(Serialize)]
struct ToolOutput {
    stdout: String,
    stderr: String,
    code: i32,
}

#[derive(Serialize, Clone)]
#[serde(tag = "event", rename_all = "camelCase")]
enum ToolEvent { Stdout { data: String }, Stderr { data: String }, Exit { code: i32 } }

#[derive(Default)]
struct ToolProcessState(Mutex<std::collections::HashMap<String, u32>>);

#[tauri::command]
fn run_tool_stream(app: AppHandle, state: State<ToolProcessState>, id: String, command: String, cwd: Option<String>,
    env: Option<std::collections::HashMap<String, String>>, stdin: Option<String>, on_event: Channel<ToolEvent>) -> Result<(), String> {
    use std::io::{BufRead, BufReader}; use std::process::{Command, Stdio};
    let mut cmd = Command::new("/bin/sh"); cmd.arg("-c").arg(command).stdout(Stdio::piped()).stderr(Stdio::piped());
    if stdin.is_some() { cmd.stdin(Stdio::piped()); } if let Some(dir) = cwd { if !dir.is_empty() { cmd.current_dir(dir); } } if let Some(values) = env { cmd.envs(values); }
    let mut child = cmd.spawn().map_err(|e| e.to_string())?; let pid = child.id();
    if let Some(input) = stdin { if let Some(mut pipe) = child.stdin.take() { pipe.write_all(input.as_bytes()).map_err(|e| e.to_string())?; } }
    let stdout = child.stdout.take(); let stderr = child.stderr.take(); state.0.lock().unwrap().insert(id.clone(), pid);
    if let Some(pipe) = stdout { let channel = on_event.clone(); std::thread::spawn(move || for line in BufReader::new(pipe).lines().map_while(Result::ok) { let _ = channel.send(ToolEvent::Stdout { data: line + "\n" }); }); }
    if let Some(pipe) = stderr { let channel = on_event.clone(); std::thread::spawn(move || for line in BufReader::new(pipe).lines().map_while(Result::ok) { let _ = channel.send(ToolEvent::Stderr { data: line + "\n" }); }); }
    std::thread::spawn(move || { let code = child.wait().ok().and_then(|s| s.code()).unwrap_or(-1); let _ = on_event.send(ToolEvent::Exit { code });
        if let Some(state) = app.try_state::<ToolProcessState>() { state.0.lock().unwrap().remove(&id); } }); Ok(())
}

#[tauri::command]
fn cancel_tool(state: State<ToolProcessState>, id: String) -> Result<(), String> {
    if let Some(pid) = state.0.lock().unwrap().get(&id).copied() { std::process::Command::new("/bin/kill").args(["-TERM", &pid.to_string()]).status().map_err(|e| e.to_string())?; }
    Ok(())
}

/// Run a user tool: a shell command (with macros already expanded on the JS
/// side) executed via `/bin/sh -c`, optionally in `cwd`. This is the user-tool
/// "user tools" feature — the user configures and triggers these explicitly.
#[tauri::command]
fn run_tool(command: String, cwd: Option<String>, env: Option<std::collections::HashMap<String, String>>, stdin: Option<String>) -> Result<ToolOutput, String> {
    use std::process::{Command, Stdio};
    let mut cmd = Command::new("/bin/sh");
    cmd.arg("-c").arg(&command);
    if let Some(dir) = cwd {
        if !dir.is_empty() {
            cmd.current_dir(dir);
        }
    }
    if let Some(values) = env { cmd.envs(values); }
    if stdin.is_some() { cmd.stdin(Stdio::piped()); }
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    if let Some(input) = stdin { if let Some(mut pipe) = child.stdin.take() { pipe.write_all(input.as_bytes()).map_err(|e| e.to_string())?; } }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    Ok(ToolOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        code: output.status.code().unwrap_or(-1),
    })
}

/// Move a file or directory to the system Trash (reversible — safer than a hard
/// delete). Backs the sidebar's right-click "Move to Trash".
#[tauri::command]
fn move_to_trash(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

/// Create a new empty file, failing if one already exists at that path.
#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    if std::path::Path::new(&path).exists() {
        return Err("A file with that name already exists.".into());
    }
    fs::write(&path, "").map_err(|e| e.to_string())
}

#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir(&path).map_err(|e| format!("Could not create folder {path}: {e}"))
}

#[tauri::command]
fn rename_path(path: String, new_path: String) -> Result<(), String> {
    if Path::new(&new_path).exists() { return Err("An item with that name already exists.".into()); }
    fs::rename(&path, &new_path).map_err(|e| format!("Could not rename {path}: {e}"))
}

#[tauri::command]
fn duplicate_path(path: String, new_path: String) -> Result<(), String> {
    if Path::new(&new_path).exists() { return Err("An item with that name already exists.".into()); }
    fn copy_tree(src: &Path, dst: &Path) -> std::io::Result<()> {
        fs::create_dir(dst)?;
        for item in fs::read_dir(src)? { let item = item?; let target = dst.join(item.file_name());
            if item.path().is_dir() { copy_tree(&item.path(), &target)?; } else { fs::copy(item.path(), target)?; }
        } Ok(())
    }
    if Path::new(&path).is_dir() { copy_tree(Path::new(&path), Path::new(&new_path)).map_err(|e| e.to_string()) }
    else { fs::copy(&path, &new_path).map(|_| ()).map_err(|e| format!("Could not duplicate {path}: {e}")) }
}

#[derive(Deserialize)]
struct SearchOptions { query: String, case_sensitive: bool, regex: bool, include_hidden: bool,
    include: String, exclude: String, max_results: usize }

#[derive(Serialize, Deserialize, Clone)]
struct SearchHit { path: String, line: usize, column: usize, length: usize, preview: String }

fn ignored_dir(name: &str) -> bool { matches!(name, ".git" | "node_modules" | "target" | "dist" | ".next") }

fn walk_files(root: &Path, hidden: bool, limit: usize, out: &mut Vec<PathBuf>) {
    let mut builder = ignore::WalkBuilder::new(root);
    builder.hidden(!hidden).git_ignore(true).git_global(true).git_exclude(true)
        .filter_entry(|e| !e.path().is_dir() || !ignored_dir(&e.file_name().to_string_lossy()));
    for item in builder.build().flatten() {
        if out.len() >= limit { break; }
        if item.path().is_file() && item.metadata().map(|m| m.len() <= 8 * 1024 * 1024).unwrap_or(false) {
            out.push(item.into_path());
        }
    }
}

#[tauri::command]
fn list_project_files(root: String, include_hidden: bool, max: usize) -> Vec<String> {
    let mut out = vec![]; walk_files(Path::new(&root), include_hidden, max, &mut out);
    out.into_iter().map(|p| p.to_string_lossy().to_string()).collect()
}

#[tauri::command]
fn search_files(root: String, options: SearchOptions) -> Result<Vec<SearchHit>, String> {
    let mut files = vec![]; walk_files(Path::new(&root), options.include_hidden, 50_000, &mut files);
    let needle = if options.case_sensitive { options.query.clone() } else { options.query.to_lowercase() };
    let matcher = if options.regex { Some(regex::RegexBuilder::new(&options.query)
        .case_insensitive(!options.case_sensitive).build().map_err(|e| format!("Invalid regular expression: {e}"))?) } else { None };
    let include: Vec<&str> = options.include.split(',').map(str::trim).filter(|s| !s.is_empty()).collect();
    let exclude: Vec<&str> = options.exclude.split(',').map(str::trim).filter(|s| !s.is_empty()).collect();
    let mut hits = vec![];
    for path in files {
        let path_text = path.to_string_lossy();
        if (!include.is_empty() && !include.iter().any(|p| path_text.contains(p.trim_matches('*'))))
            || exclude.iter().any(|p| path_text.contains(p.trim_matches('*'))) { continue; }
        let Ok(data) = fs::read(&path) else { continue }; let (text, _) = decode_text(&data);
        for (idx, line) in text.lines().enumerate() {
            let hay = if options.case_sensitive { line.to_string() } else { line.to_lowercase() };
            let found = matcher.as_ref().and_then(|r| r.find(line).map(|m| (m.start(), m.end() - m.start())))
                .or_else(|| if matcher.is_none() { hay.find(&needle).map(|p| (p, options.query.len())) } else { None });
            if let Some((col, length)) = found {
                hits.push(SearchHit { path: path.to_string_lossy().to_string(), line: idx + 1,
                    column: col + 1, length, preview: line.trim().chars().take(240).collect() });
                if hits.len() >= options.max_results { return Ok(hits); }
            }
        }
    } Ok(hits)
}

#[tauri::command]
fn replace_file_matches(state: State<ReplaceUndoState>, targets: Vec<SearchHit>, replacement: String) -> Result<usize, String> {
    use std::collections::HashMap;
    let mut grouped: HashMap<String, Vec<SearchHit>> = HashMap::new();
    for target in targets { grouped.entry(target.path.clone()).or_default().push(target); }
    let mut originals: Vec<(String, Vec<u8>)> = vec![]; let mut count = 0;
    for (path, mut hits) in grouped {
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        let mut text = String::from_utf8(bytes.clone()).map_err(|_| format!("Replace in Files currently requires UTF-8: {path}"))?;
        let starts: Vec<usize> = std::iter::once(0).chain(text.match_indices('\n').map(|(i, _)| i + 1)).collect();
        hits.sort_by_key(|h| std::cmp::Reverse((h.line, h.column)));
        for hit in &hits {
            let start = *starts.get(hit.line.saturating_sub(1)).ok_or("A file changed during replacement.")? + hit.column.saturating_sub(1);
            let end = start + hit.length;
            if end > text.len() || !text.is_char_boundary(start) || !text.is_char_boundary(end) { return Err(format!("A file changed during replacement: {path}")); }
            text.replace_range(start..end, &replacement); count += 1;
        }
        originals.push((path.clone(), bytes));
        if let Err(error) = fs::write(&path, text.as_bytes()) {
            for (written, original) in &originals { let _ = fs::write(written, original); }
            return Err(format!("Replacement failed and written files were restored: {error}"));
        }
    }
    *state.0.lock().unwrap() = Some(originals); Ok(count)
}

#[derive(Default)]
struct ReplaceUndoState(Mutex<Option<Vec<(String, Vec<u8>)>>>);

#[tauri::command]
fn undo_replace_files(state: State<ReplaceUndoState>) -> Result<usize, String> {
    let originals = state.0.lock().unwrap().take().ok_or("There is no Replace in Files transaction to undo.")?; let count = originals.len();
    for (path, bytes) in originals { fs::write(path, bytes).map_err(|e| e.to_string())?; } Ok(count)
}

#[derive(Default)]
struct PendingOpen(Mutex<Vec<String>>);

#[tauri::command]
fn take_open_files(state: State<PendingOpen>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

#[tauri::command]
fn install_cli() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?; let dir = Path::new(&home).join(".local/bin"); fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("mcedit"); let script = "#!/bin/sh\nAPP=\"/Applications/Klickrr - Edit.app/Contents/MacOS/klickrr-edit\"\nif [ ! -x \"$APP\" ]; then echo \"Install Klickrr - Edit in /Applications first.\" >&2; exit 1; fi\n\"$APP\" \"$@\" >/dev/null 2>&1 &\n";
    fs::write(&path, script).map_err(|e| e.to_string())?;
    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?; }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn git_command(root: String, args: Vec<String>) -> Result<ToolOutput, String> {
    let output = std::process::Command::new("git").arg("-C").arg(root).args(args).output().map_err(|e| e.to_string())?;
    Ok(ToolOutput { stdout: String::from_utf8_lossy(&output.stdout).to_string(), stderr: String::from_utf8_lossy(&output.stderr).to_string(), code: output.status.code().unwrap_or(-1) })
}

#[tauri::command]
fn quick_look(path: String) -> Result<(), String> { std::process::Command::new("qlmanage").args(["-p", &path]).spawn().map(|_| ()).map_err(|e| e.to_string()) }

#[tauri::command]
fn install_login_item() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?; let dir = Path::new(&home).join("Library/LaunchAgents"); fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("com.klickrr.edit.plist"); let plist = r#"<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>com.klickrr.edit</string><key>ProgramArguments</key><array><string>/usr/bin/open</string><string>-a</string><string>Klickrr - Edit</string></array><key>RunAtLoad</key><true/></dict></plist>"#;
    fs::write(&path, plist).map_err(|e| e.to_string())?; Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn install_finder_quick_action() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?; let root = Path::new(&home).join("Library/Services/Open in Klickrr - Edit.workflow/Contents"); fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let info = r#"<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.klickrr.edit.quickaction</string><key>CFBundleName</key><string>Open in Klickrr - Edit</string><key>NSServices</key><array><dict><key>NSMenuItem</key><dict><key>default</key><string>Open in Klickrr - Edit</string></dict><key>NSMessage</key><string>runWorkflowAsService</string><key>NSSendFileTypes</key><array><string>public.item</string></array></dict></array></dict></plist>"#;
    let workflow = r#"<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>AMApplicationBuild</key><string>523</string><key>AMApplicationVersion</key><string>2.10</string><key>AMDocumentVersion</key><string>2</string><key>actions</key><array><dict><key>action</key><dict><key>AMAccepts</key><dict><key>Container</key><string>List</string><key>Optional</key><true/><key>Types</key><array><string>com.apple.cocoa.path</string></array></dict><key>AMActionVersion</key><string>2.0.3</string><key>AMApplication</key><array><string>Automator</string></array><key>AMParameterProperties</key><dict/><key>AMProvides</key><dict><key>Container</key><string>List</string><key>Types</key><array><string>com.apple.cocoa.path</string></array></dict><key>ActionBundlePath</key><string>/System/Library/Automator/Run Shell Script.action</string><key>ActionName</key><string>Run Shell Script</string><key>ActionParameters</key><dict><key>COMMAND_STRING</key><string>for f in "$@"; do open -a "Klickrr - Edit" "$f"; done</string><key>inputMethod</key><integer>1</integer><key>shell</key><string>/bin/zsh</string></dict><key>BundleIdentifier</key><string>com.apple.RunShellScript</string></dict></dict></array><key>connectors</key><dict/><key>workflowMetaData</key><dict><key>serviceInputTypeIdentifier</key><string>com.apple.Automator.fileSystemObject</string><key>serviceOutputTypeIdentifier</key><string>com.apple.Automator.nothing</string><key>serviceProcessesInput</key><integer>0</integer></dict></dict></plist>"#;
    fs::write(root.join("Info.plist"), info).map_err(|e| e.to_string())?; fs::write(root.join("document.wflow"), workflow).map_err(|e| e.to_string())?; Ok(root.parent().unwrap().to_string_lossy().to_string())
}

// --- integrated terminal (PTY) ---------------------------------------------
struct TermSession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
}

#[derive(Default)]
struct PtyState(Mutex<Option<TermSession>>);

/// Spawn the login shell in a PTY (once). Output streams to the frontend via the
/// "pty-output" event; the terminal UI writes back through `pty_write`.
#[tauri::command]
fn pty_start(
    app: AppHandle,
    state: State<PtyState>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    if guard.is_some() {
        return Ok(()); // already running — keep the existing session
    }

    let pair = native_pty_system()
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = CommandBuilder::new(shell);
    cmd.arg("-l");
    cmd.env("TERM", "xterm-256color");
    if let Some(dir) = cwd {
        if !dir.is_empty() {
            cmd.cwd(dir);
        }
    }

    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave); // let the parent side see EOF when the shell exits

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let app_out = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_out.emit("pty-output", chunk);
                }
            }
        }
        let _ = child.wait();
        let _ = app_out.emit("pty-exit", ());
    });

    *guard = Some(TermSession {
        master: pair.master,
        writer,
    });
    Ok(())
}

#[tauri::command]
fn pty_write(state: State<PtyState>, data: String) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    if let Some(session) = guard.as_mut() {
        session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn pty_resize(state: State<PtyState>, cols: u16, rows: u16) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    if let Some(session) = guard.as_ref() {
        session
            .master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn pty_kill(state: State<PtyState>) {
    // Dropping the session closes the PTY, which hangs up the shell.
    *state.0.lock().unwrap() = None;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            // Follow standard macOS document-app behavior: the red traffic-light
            // button dismisses the window, but the application and menu bar stay
            // alive until the user explicitly chooses Klickrr - Edit > Quit.
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle().clone();
                if window.is_fullscreen().unwrap_or(false) {
                    // Hiding a native full-screen NSWindow immediately leaves its
                    // dedicated Space visible as a black screen. First request a
                    // normal-window transition, then hide after the Space animation.
                    let _ = window.set_fullscreen(false);
                    let window = window.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(750));
                        let main_app = app.clone();
                        let _ = app.run_on_main_thread(move || {
                            let _ = window.hide();
                            let _ = main_app.hide();
                        });
                    });
                } else {
                    let _ = window.hide();
                    // Deactivate Klickrr so Finder/the previous desktop app becomes
                    // active, while the process remains available from the Dock.
                    let _ = app.hide();
                }
            }
        })
        .manage(PtyState::default())
        .manage(ToolProcessState::default())
        .manage(ReplaceUndoState::default())
        .manage(PendingOpen::default())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            resolve_editor_config,
            write_text_file,
            stat_file,
            tail_file,
            read_file_bytes,
            write_file_bytes,
            list_dir,
            home_dir,
            run_tool,
            run_tool_stream,
            cancel_tool,
            move_to_trash,
            create_file,
            create_dir,
            rename_path,
            duplicate_path,
            list_project_files,
            search_files,
            replace_file_matches,
            undo_replace_files,
            take_open_files,
            install_cli,
            git_command,
            quick_look,
            install_login_item,
            install_finder_quick_action,
            pty_start,
            pty_write,
            pty_resize,
            pty_kill
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Finder's Open With / double-click sends an Opened event. Queue the paths
    // so cold launches cannot race frontend startup, and also emit for warm ones.
    {
        let state = app.state::<PendingOpen>();
        for arg in std::env::args().skip(1) { if !arg.starts_with('-') { state.0.lock().unwrap().push(arg); } }
    }
    app.run(|handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { has_visible_windows, .. } = event {
            if !has_visible_windows {
                let _ = handle.show();
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            return;
        }
        if let tauri::RunEvent::Opened { urls } = event {
            let paths: Vec<String> = urls.into_iter().filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().to_string()).collect();
            if !paths.is_empty() {
                // Finder may deliver Opened while another application is active.
                // Bring our native window forward before handing paths to JS.
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
                if let Some(state) = handle.try_state::<PendingOpen>() {
                    state.0.lock().unwrap().extend(paths.clone());
                }
                let _ = handle.emit("open-files", paths);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_bom_and_line_endings() {
        let (text, enc) = decode_text(&[0xef, 0xbb, 0xbf, b'a', b'\r', b'\n']);
        assert_eq!(enc, "utf-8-bom");
        assert_eq!(line_ending(&text), "crlf");
    }

    #[test]
    fn utf16_round_trip() {
        let bytes = encode_text("Hello 🦀", "utf-16le").unwrap();
        let (text, enc) = decode_text(&bytes);
        assert_eq!(enc, "utf-16le");
        assert_eq!(text, "Hello 🦀");
    }

    #[test]
    fn ascii_rejects_unrepresentable_text() {
        assert!(encode_text("café", "ascii").is_err());
    }
}
