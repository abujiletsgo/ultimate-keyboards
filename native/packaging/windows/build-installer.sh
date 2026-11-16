#!/usr/bin/env bash
# Builds the unsigned per-user NSIS installer for the host architecture (x64 or ARM64).
# Output: src-tauri/target/<triple>/release/bundle/nsis/*-setup.exe
# Run from anywhere on a Windows machine with Rust and bun installed.
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
cd "$root"
triple=$(rustc -vV | sed -n 's/^host: //p')
case "$triple" in
  *-pc-windows-msvc) ;;
  *) echo "build-installer.sh builds the Windows installer; host is $triple" >&2; exit 1 ;;
esac
cargo build --locked --release --manifest-path native/service-win/Cargo.toml
mkdir -p native/packaging/windows/stage
cp native/service-win/target/release/ultimate-keyboards-remapper-win.exe \
  "native/packaging/windows/stage/ultimate-keyboards-remapper-win-$triple.exe"
bunx tauri build --target "$triple" --config native/packaging/windows/tauri.installer.conf.json
ls -l src-tauri/target/"$triple"/release/bundle/nsis/*-setup.exe
