//! Build integration without secrets: read-only `git` state for the config
//! repo, the user's own `gh` CLI (their auth, our allow-list of subcommands),
//! artifact download into the repo, and an explicit UF2 flash step.
//!
//! Build commits and pushes only the files the app edits (keymap, combos,
//! pointing), only when the user clicks Build, with the user's own git
//! credentials. Firmware is stored per commit in `<repo>/firmware/<sha>/` so a
//! flash can only ever use the build of the config that is on screen.
//! No tokens are stored.

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
    /// full sha of HEAD
    head: String,
}

fn is_sha(s: &str) -> bool {
    s.len() == 40 && s.chars().all(|c| c.is_ascii_hexdigit())
}

/// Turn an absolute (or repo-relative) path into a repo-relative one, refusing
/// anything outside the repository.
fn repo_rel(repo: &Path, path: &str) -> Result<String, String> {
    let pb = Path::new(path);
    let rel = if pb.is_absolute() {
        pb.strip_prefix(repo).map_err(|_| format!("{path} is outside the repository"))?.to_path_buf()
    } else {
        pb.to_path_buf()
    };
    if rel.components().any(|c| matches!(c, std::path::Component::ParentDir)) || rel.as_os_str().is_empty() {
        return Err(format!("{path} is outside the repository"));
    }
    Ok(rel.to_string_lossy().to_string())
}

#[tauri::command(async)]
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
    let head = run(git(), &["rev-parse", "HEAD"], Some(&p))?.trim().to_string();
    Ok(RepoStatus { branch, ahead, behind, changes, remote, github, head })
}

/// Commit the named files (when they changed) and push the current branch when
/// it is ahead of its upstream. Other uncommitted files are left alone.
/// Returns the sha of HEAD afterwards: the commit GitHub Actions will build.
#[tauri::command(async)]
pub fn git_commit_push(repo: String, paths: Vec<String>, message: String) -> Result<String, String> {
    let p = check_repo(&repo)?;
    let mut rels = Vec::new();
    for path in &paths {
        let rel = repo_rel(&p, path)?;
        if p.join(&rel).exists() {
            rels.push(rel);
        }
    }
    if !rels.is_empty() {
        let mut add = vec!["add", "--"];
        add.extend(rels.iter().map(|s| s.as_str()));
        run(git(), &add, Some(&p))?;
        let mut diff = vec!["diff", "--cached", "--quiet", "--"];
        diff.extend(rels.iter().map(|s| s.as_str()));
        if run(git(), &diff, Some(&p)).is_err() {
            let msg = if message.trim().is_empty() { "Update keymap" } else { message.trim() };
            let mut commit = vec!["commit", "-m", msg, "--"];
            commit.extend(rels.iter().map(|s| s.as_str()));
            run(git(), &commit, Some(&p))?;
        }
    }
    let ahead = run(git(), &["rev-list", "--count", "@{upstream}..HEAD"], Some(&p))
        .map(|s| s.trim().parse::<u32>().unwrap_or(0))
        .map_err(|e| format!("branch has no upstream to push to: {e}"))?;
    if ahead > 0 {
        run(git(), &["push"], Some(&p)).map_err(|e| format!("push failed: {e}"))?;
    }
    Ok(run(git(), &["rev-parse", "HEAD"], Some(&p))?.trim().to_string())
}

/// Unified diff of one file inside the repo (working tree vs HEAD).
#[tauri::command(async)]
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

#[tauri::command(async)]
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
#[tauri::command(async)]
pub fn gh_run_list(repo: String, branch: String, limit: u32, commit: Option<String>) -> Result<String, String> {
    let gh = find_gh().ok_or("gh CLI not found")?;
    let lim = limit.clamp(1, 20).to_string();
    if !branch.chars().all(|c| c.is_ascii_alphanumeric() || "-_./".contains(c)) {
        return Err("invalid branch name".into());
    }
    let p = check_repo(&repo)?;
    let mut args = vec!["run", "list", "--branch", &branch, "--limit", &lim, "--json", "databaseId,status,conclusion,displayTitle,createdAt,updatedAt,headSha,url"];
    if let Some(c) = commit.as_deref() {
        if !is_sha(c) {
            return Err("invalid commit sha".into());
        }
        args.extend(["--commit", c]);
    }
    run(gh.to_str().unwrap(), &args, Some(&p))
}

/// Download every artifact of a run into `<repo>/firmware/<sha>/` and list the uf2 files found.
#[tauri::command(async)]
pub fn gh_run_download(repo: String, run_id: u64, sha: String) -> Result<Vec<String>, String> {
    let gh = find_gh().ok_or("gh CLI not found")?;
    let p = check_repo(&repo)?;
    if !is_sha(&sha) {
        return Err("invalid commit sha".into());
    }
    let dest = p.join("firmware").join(&sha);
    let _ = std::fs::remove_dir_all(&dest);
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

/// List the uf2 files built from commit `sha` (`<repo>/firmware/<sha>/`).
/// Loose files elsewhere in `firmware/` are never offered: nothing ties them
/// to the config on screen.
#[tauri::command(async)]
pub fn list_firmware(repo: String, sha: String) -> Result<Vec<String>, String> {
    let p = check_repo(&repo)?;
    if !is_sha(&sha) {
        return Err("invalid commit sha".into());
    }
    let dir = p.join("firmware").join(&sha);
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
#[tauri::command(async)]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repo_rel_rejects_outside_paths() {
        let repo = Path::new("/r/cfg");
        assert_eq!(repo_rel(repo, "/r/cfg/config/a.keymap").unwrap(), "config/a.keymap");
        assert_eq!(repo_rel(repo, "config/a.keymap").unwrap(), "config/a.keymap");
        assert!(repo_rel(repo, "/r/other/a.keymap").is_err());
        assert!(repo_rel(repo, "../x").is_err());
        assert!(repo_rel(repo, "config/../../x").is_err());
    }

    #[test]
    fn sha_validation() {
        assert!(is_sha("caffea1caffea1caffea1caffea1caffea1caffe"));
        assert!(!is_sha("caffea1"));
        assert!(!is_sha("--upload-pack=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"));
    }

    fn sh(dir: &Path, args: &[&str]) {
        let o = Command::new(git()).args(args).current_dir(dir).output().unwrap();
        assert!(o.status.success(), "{:?}: {}", args, String::from_utf8_lossy(&o.stderr));
    }

    /// Commits only the named file and pushes it; unrelated changes stay uncommitted.
    #[test]
    fn commit_push_only_named_files() {
        let base = std::env::temp_dir().join(format!("uk-build-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let (remote, work) = (base.join("remote.git"), base.join("work"));
        std::fs::create_dir_all(&work).unwrap();
        sh(&base, &["init", "-q", "--bare", "-b", "main", remote.to_str().unwrap()]);
        sh(&work, &["init", "-q", "-b", "main"]);
        sh(&work, &["config", "user.email", "t@t"]);
        sh(&work, &["config", "user.name", "t"]);
        std::fs::write(work.join("a.keymap"), "one").unwrap();
        std::fs::write(work.join("notes.md"), "x").unwrap();
        sh(&work, &["add", "."]);
        sh(&work, &["commit", "-qm", "init"]);
        sh(&work, &["remote", "add", "origin", remote.to_str().unwrap()]);
        sh(&work, &["push", "-qu", "origin", "main"]);

        std::fs::write(work.join("a.keymap"), "two").unwrap();
        std::fs::write(work.join("notes.md"), "y").unwrap();
        let repo = work.to_string_lossy().to_string();
        let keymap = work.join("a.keymap").to_string_lossy().to_string();
        let sha = git_commit_push(repo.clone(), vec![keymap.clone()], "Update keymap".into()).unwrap();
        assert!(is_sha(&sha));
        let remote_head = run(git(), &["rev-parse", "main"], Some(&remote)).unwrap();
        assert_eq!(remote_head.trim(), sha);
        let status = run(git(), &["status", "--porcelain"], Some(&work)).unwrap();
        assert_eq!(status.trim(), "M notes.md");
        // Nothing changed: no new commit, same sha.
        assert_eq!(git_commit_push(repo, vec![keymap], "again".into()).unwrap(), sha);
        let _ = std::fs::remove_dir_all(&base);
    }
}
