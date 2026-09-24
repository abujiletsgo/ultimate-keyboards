#!/usr/bin/env bash
# Ultimate Keyboards — install all dependencies
set -e

echo "==> Checking dependencies for Ultimate Keyboards"

# ── Homebrew ──────────────────────────────────────────────────────────────────
if ! command -v brew &>/dev/null; then
  echo "Homebrew is required. Install it from https://brew.sh (review the script there), then re-run this installer."
  exit 1
fi

# ── Rust / Cargo (required for Tauri) ────────────────────────────────────────
if ! command -v cargo &>/dev/null; then
  echo "Installing Rust via Homebrew (no remote scripts are piped to a shell)..."
  brew install rustup
  rustup-init -y --no-modify-path
  source "$HOME/.cargo/env"
fi

# ── Bun (JS runtime + package manager) ───────────────────────────────────────
if ! command -v bun &>/dev/null; then
  echo "Installing Bun..."
  brew install oven-sh/bun/bun
fi

# ── Karabiner-Elements (for MacBook key remapping / combos) ──────────────────
if ! [ -d "/Applications/Karabiner-Elements.app" ]; then
  echo "Installing Karabiner-Elements..."
  brew install --cask karabiner-elements
else
  echo "  Karabiner-Elements already installed"
fi

# ── Node modules ──────────────────────────────────────────────────────────────
echo "==> Installing JS dependencies..."
cd "$(dirname "$0")"
bun install --frozen-lockfile

# ── Pre-create Karabiner complex_modifications dir ────────────────────────────
mkdir -p ~/.config/karabiner/assets/complex_modifications

echo ""
echo "✓ All dependencies installed."
echo ""
echo "To run the app:"
echo "  bun run tauri:dev"
echo ""
echo "To use MacBook key combos:"
echo "  1. Open Karabiner-Elements"
echo "  2. Go to Complex Modifications → Add rule"
echo "  3. Enable rules from 'Ultimate Keyboards'"
