//! "Create my config" for new ZMK owners: a repo from ZMK's official template
//! on the user's own GitHub (their `gh` login), cloned into ~/Documents, and
//! one initial commit + push of the files the app writes (build.yaml, keymap,
//! west.yml pin). Nothing else in the app pushes.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

const TEMPLATE: &str = "zmkfirmware/unified-zmk-config-template";

fn find_gh() -> Result<PathBuf, String> {
    ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"]
        .iter()
        .map(PathBuf::from)
        .find(|p| p.exists())
        .ok_or_else(|| "GitHub CLI (gh) is not installed. Install it with `brew install gh`, run `gh auth login`, then try again.".to_string())
}

fn run(bin: &Path, args: &[&str], cwd: Option<&Path>) -> Result<String, String> {
    let mut cmd = Command::new(bin);
    cmd.args(args);
    if let Some(d) = cwd {
        cmd.current_dir(d);
    }
    let out = cmd.output().map_err(|e| format!("{}: {e}", bin.display()))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// GitHub repo names: letters, digits, `-`, `_`, `.`; 1–100 chars; not `.`/`..`.
pub fn valid_repo_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 100
        && name != "."
        && name != ".."
        && !name.starts_with('-')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

fn documents_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or("HOME is not set")?;
    Ok(PathBuf::from(home).join("Documents"))
}

#[derive(serde::Serialize)]
pub struct CreatedConfig {
    /// owner/name on GitHub
    github: String,
    /// local clone
    path: String,
}

/// Create `<gh user>/<name>` from the ZMK template and clone it to ~/Documents/<name>.
#[tauri::command(async)]
pub fn create_zmk_config(name: String, private: bool) -> Result<CreatedConfig, String> {
    if !valid_repo_name(&name) {
        return Err("Use only letters, numbers, '-', '_' and '.' for the repository name.".into());
    }
    let dest = documents_dir()?.join(&name);
    if dest.exists() {
        return Err(format!("{} already exists. Pick another name.", dest.display()));
    }
    let gh = find_gh()?;
    let user = run(&gh, &["api", "user", "-q", ".login"], None)
        .map_err(|e| format!("Not signed in to GitHub. Run `gh auth login` in Terminal, then try again. ({e})"))?;
    let full = format!("{user}/{name}");
    run(
        &gh,
        &["repo", "create", &full, "--template", TEMPLATE, if private { "--private" } else { "--public" }],
        None,
    )?;
    // GitHub fills a template repo asynchronously; retry the clone briefly.
    let start = Instant::now();
    let dest_s = dest.to_string_lossy().to_string();
    loop {
        match run(&gh, &["repo", "clone", &full, &dest_s], None) {
            Ok(_) if dest.join("build.yaml").exists() => break,
            Ok(_) => {
                // cloned before the template content landed: start over
                let _ = std::fs::remove_dir_all(&dest);
            }
            Err(e) if start.elapsed() > Duration::from_secs(40) => {
                return Err(format!("Created https://github.com/{full} but could not download it: {e}"))
            }
            Err(_) => {}
        }
        if start.elapsed() > Duration::from_secs(40) {
            return Err(format!("Created https://github.com/{full} but its files did not appear in time. Try `gh repo clone {full}`."));
        }
        std::thread::sleep(Duration::from_secs(2));
    }
    pin_workflow_to_main(&dest)?;
    Ok(CreatedConfig { github: full, path: dest_s })
}

/// The template calls `build-user-config.yml@v0.x`; the app pins ZMK to main (the
/// catalogue's source), so the workflow must match. Done here because the webview's
/// file scope does not cover dot-directories.
fn pin_workflow_to_main(repo: &Path) -> Result<(), String> {
    let wf = repo.join(".github").join("workflows").join("build.yml");
    let text = std::fs::read_to_string(&wf).map_err(|e| format!("{}: {e}", wf.display()))?;
    std::fs::write(&wf, pin_ref(&text)).map_err(|e| format!("{}: {e}", wf.display()))
}

pub fn pin_ref(text: &str) -> String {
    const KEY: &str = "build-user-config.yml@";
    match text.find(KEY) {
        None => text.to_string(),
        Some(i) => {
            let start = i + KEY.len();
            let end = text[start..].find(|c: char| c.is_whitespace()).map(|j| start + j).unwrap_or(text.len());
            format!("{}main{}", &text[..start], &text[end..])
        }
    }
}

/// Commit everything in a repo created by `create_zmk_config` and push it.
/// Refuses any path outside ~/Documents or without a GitHub origin.
#[tauri::command(async)]
pub fn push_initial_config(repo: String, message: String) -> Result<(), String> {
    let p = PathBuf::from(&repo);
    let docs = documents_dir()?;
    let canon = p.canonicalize().map_err(|e| e.to_string())?;
    if !canon.starts_with(docs.canonicalize().map_err(|e| e.to_string())?) || !canon.join(".git").exists() {
        return Err("only a config repo in ~/Documents can be pushed".into());
    }
    let git = Path::new("/usr/bin/git");
    let origin = run(git, &["remote", "get-url", "origin"], Some(&canon))?;
    if !origin.contains("github.com") {
        return Err("the repo has no GitHub origin".into());
    }
    run(git, &["add", "-A"], Some(&canon))?;
    run(git, &["commit", "-m", &message], Some(&canon))?;
    let gh = find_gh()?;
    // make sure git can use the gh login for https pushes
    let _ = run(&gh, &["auth", "setup-git"], None);
    run(git, &["push", "origin", "HEAD"], Some(&canon))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::valid_repo_name;

    #[test]
    fn repo_names() {
        assert!(valid_repo_name("zmk-config"));
        assert!(valid_repo_name("my_corne.v2"));
        assert!(!valid_repo_name(""));
        assert!(!valid_repo_name(".."));
        assert!(!valid_repo_name("-x"));
        assert!(!valid_repo_name("a/b"));
        assert!(!valid_repo_name("a b"));
    }

    #[test]
    fn workflow_pin() {
        let t = "jobs:\n  build:\n    uses: zmkfirmware/zmk/.github/workflows/build-user-config.yml@v0.3\n";
        assert_eq!(super::pin_ref(t), "jobs:\n  build:\n    uses: zmkfirmware/zmk/.github/workflows/build-user-config.yml@main\n");
        assert_eq!(super::pin_ref("x"), "x");
    }
}
