#!/usr/bin/env bash
# Ultimate Keyboards — install all dependencies
set -e

echo "==> Checking dependencies for Ultimate Keyboards"

# ── Homebrew ──────────────────────────────────────────────────────────────────
if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# ── Rust / Cargo (required for Tauri) ────────────────────────────────────────
if ! command -v cargo &>/dev/null; then
  echo "Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
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
bun install

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
