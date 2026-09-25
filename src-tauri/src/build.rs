//! Build integration without secrets: read-only `git` state for the config
//! repo, the user's own `gh` CLI (their auth, our allow-list of subcommands),
//! artifact download into the repo, and an explicit UF2 flash step.
//!
//! Nothing here pushes, commits, or stores tokens.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

fn git() -> &'static str {
    "/usr/bin/git"
}

fn find_gh() -> Option<PathBuf> {
    ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"]
        .iter()
        .map(PathBuf::from)
        .find(|p| p.exists())
}

fn run(bin: &str, args: &[&str], cwd: Option<&Path>) -> Result<String, String> {
    let mut cmd = Command::new(bin);
    cmd.args(args);
    if let Some(d) = cwd {
        cmd.current_dir(d);
    }
    let out = cmd.output().map_err(|e| format!("{bin}: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

fn check_repo(repo: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(repo);
    if !p.is_dir() || !p.join(".git").exists() {
        return Err("not a git repository".into());
    }
    Ok(p)
}

#[derive(serde::Serialize)]
pub struct RepoStatus {
    branch: String,
    ahead: u32,
    behind: u32,
    /// `git status --porcelain` lines
    changes: Vec<String>,
    /// origin URL, if any
    remote: Option<String>,
    /// owner/name when the remote is on github.com
    github: Option<String>,
}

#[tauri::command]
pub fn git_repo_status(repo: String) -> Result<RepoStatus, String> {
    let p = check_repo(&repo)?;
    let branch = run(git(), &["rev-parse", "--abbrev-ref", "HEAD"], Some(&p))?.trim().to_string();
    let (mut ahead, mut behind) = (0u32, 0u32);
    if let Ok(counts) = run(git(), &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], Some(&p)) {
        let mut it = counts.split_whitespace();
        ahead = it.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        behind = it.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    }
    let changes = run(git(), &["status", "--porcelain"], Some(&p))?
        .lines()
        .map(|l| l.to_string())
        .collect();
    let remote = run(git(), &["remote", "get-url", "origin"], Some(&p)).ok().map(|s| s.trim().to_string());
    let github = remote.as_ref().and_then(|r| {
        let r = r.trim_end_matches(".git");
        r.split("github.com").nth(1).map(|rest| rest.trim_start_matches([':', '/']).to_string())
    });
    Ok(RepoStatus { branch, ahead, behind, changes, remote, github })
}

/// Unified diff of one file inside the repo (working tree vs HEAD).
#[tauri::command]
pub fn git_diff_file(repo: String, path: String) -> Result<String, String> {
    let p = check_repo(&repo)?;
    let rel = Path::new(&path)
        .strip_prefix(&p)
        .map_err(|_| "file is outside the repository".to_string())?
        .to_string_lossy()
        .to_string();
    run(git(), &["diff", "--no-color", "--", &rel], Some(&p))
}

#[derive(serde::Serialize)]
pub struct GhInfo {
    available: bool,
    logged_in: bool,
    detail: String,
}

#[tauri::command]
pub fn gh_info() -> GhInfo {
    let Some(gh) = find_gh() else {
        return GhInfo { available: false, logged_in: false, detail: "gh CLI not found (brew install gh)".into() };
    };
    match Command::new(&gh).args(["auth", "status"]).output() {
        Ok(o) => {
            let text = format!("{}{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr));
            GhInfo { available: true, logged_in: o.status.success(), detail: text.lines().take(3).collect::<Vec<_>>().join(" ") }
        }
        Err(e) => GhInfo { available: true, logged_in: false, detail: e.to_string() },
    }
}

/// Recent workflow runs for a branch (JSON from `gh run list`).
#[tauri::command]
pub fn gh_run_list(repo: String, branch: String, limit: u32) -> Result<String, String> {
    let gh = find_gh().ok_or("gh CLI not found")?;
    let lim = limit.clamp(1, 20).to_string();
    if !branch.chars().all(|c| c.is_ascii_alphanumeric() || "-_./".contains(c)) {
        return Err("invalid branch name".into());
    }
    let p = check_repo(&repo)?;
    run(
        gh.to_str().unwrap(),
        &["run", "list", "--branch", &branch, "--limit", &lim, "--json", "databaseId,status,conclusion,displayTitle,createdAt,updatedAt,headSha,url"],
        Some(&p),
    )
}

/// Download every artifact of a run into `<repo>/firmware/` and list the uf2 files found.
#[tauri::command]
pub fn gh_run_download(repo: String, run_id: u64) -> Result<Vec<String>, String> {
    let gh = find_gh().ok_or("gh CLI not found")?;
    let p = check_repo(&repo)?;
    let dest = p.join("firmware");
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    let tmp = std::env::temp_dir().join(format!("uk-artifacts-{run_id}"));
    let _ = std::fs::remove_dir_all(&tmp);
    run(gh.to_str().unwrap(), &["run", "download", &run_id.to_string(), "-D", tmp.to_str().unwrap()], Some(&p))?;
    let mut found = Vec::new();
    fn walk(dir: &Path, dest: &Path, found: &mut Vec<String>) {
        if let Ok(rd) = std::fs::read_dir(dir) {
            for e in rd.flatten() {
                let path = e.path();
                if path.is_dir() {
                    walk(&path, dest, found);
                } else if path.extension().map(|x| x == "uf2").unwrap_or(false) {
                    let target = dest.join(path.file_name().unwrap());
                    if std::fs::copy(&path, &target).is_ok() {
                        found.push(target.to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    walk(&tmp, &dest, &mut found);
    let _ = std::fs::remove_dir_all(&tmp);
    found.sort();
    Ok(found)
}

/// List uf2 files already in `<repo>/firmware/`.
#[tauri::command]
pub fn list_firmware(repo: String) -> Result<Vec<String>, String> {
    let p = check_repo(&repo)?;
    let dir = p.join("firmware");
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            let path = e.path();
            if path.extension().map(|x| x == "uf2").unwrap_or(false) {
                out.push(path.to_string_lossy().to_string());
            }
        }
    }
    out.sort();
    Ok(out)
}

/// Wait (up to `timeout_secs`) for a UF2 bootloader volume to mount, copy the
/// file onto it, and report. The user triggers this explicitly per half.
#[tauri::command]
pub fn flash_uf2(path: String, timeout_secs: u64) -> Result<String, String> {
    let src = PathBuf::from(&path);
    if !src.is_file() || src.extension().map(|x| x != "uf2").unwrap_or(true) {
        return Err("not a .uf2 file".into());
    }
    let deadline = Instant::now() + Duration::from_secs(timeout_secs.clamp(5, 300));
    let volume = loop {
        if let Some(v) = find_uf2_volume() {
            break v;
        }
        if Instant::now() > deadline {
            return Err("no UF2 bootloader volume appeared (double-tap reset on the half you want to flash)".into());
        }
        std::thread::sleep(Duration::from_millis(500));
    };
    let target = volume.join(src.file_name().unwrap());
    // The board reboots as soon as the file lands, which makes the copy report
    // "Device not configured" on macOS even though the write completed.
    match std::fs::copy(&src, &target) {
        Ok(_) => {}
        Err(e) if e.raw_os_error() == Some(6) => {}
        Err(e) => return Err(format!("copy failed: {e}")),
    }
    // Wait for the volume to disappear = the board rebooted into the new firmware.
    let gone_deadline = Instant::now() + Duration::from_secs(15);
    while volume.exists() && Instant::now() < gone_deadline {
        std::thread::sleep(Duration::from_millis(300));
    }
    Ok(format!("{} → {}{}", src.file_name().unwrap().to_string_lossy(), volume.display(), if volume.exists() { " (volume still mounted)" } else { " (board rebooted)" }))
}

fn find_uf2_volume() -> Option<PathBuf> {
    let vols = std::fs::read_dir("/Volumes").ok()?;
    for e in vols.flatten() {
        let p = e.path();
        if p.join("INFO_UF2.TXT").exists() {
            return Some(p);
        }
    }
    None
}
