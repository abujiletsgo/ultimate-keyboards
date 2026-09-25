#!/usr/bin/env bash
# One-time: create the updater signing keypair, keep the private key on this Mac
# (~/.tauri, password in the login keychain), give GitHub Actions the secrets it
# needs to sign releases, and put the public key into tauri.conf.json.
#
# Run from the repo root:  bash scripts/setup-updater-key.sh
# Re-running refuses to overwrite an existing key (a new key would strand every
# installed copy on its current version).
set -euo pipefail
cd "$(dirname "$0")/.."

KEY="$HOME/.tauri/ultimate-keyboards.key"
PUB="$KEY.pub"
REPO="abujiletsgo/ultimate-keyboards"
SERVICE="tauri-updater-key-password"

if [ -e "$KEY" ]; then
  echo "A key already exists at $KEY; not overwriting it."
else
  mkdir -p "$HOME/.tauri"
  PW="$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')"
  bunx tauri signer generate --ci -p "$PW" -w "$KEY" >/dev/null
  chmod 600 "$KEY"
  security add-generic-password -a ultimate-keyboards -s "$SERVICE" -w "$PW" -U
  echo "Created $KEY (password stored in the login keychain as '$SERVICE')."
fi

PW="$(security find-generic-password -a ultimate-keyboards -s "$SERVICE" -w)"
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo "$REPO" < "$KEY"
printf '%s' "$PW" | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo "$REPO"
echo "GitHub Actions secrets set on $REPO."

python3 - "$PUB" <<'PY'
import json, sys
pub = open(sys.argv[1]).read().strip()
p = 'src-tauri/tauri.conf.json'
c = json.load(open(p))
c['plugins']['updater']['pubkey'] = pub
open(p, 'w').write(json.dumps(c, indent=2, ensure_ascii=False) + '\n')
print('Public key written to', p)
PY
echo
echo "Back up $KEY and its keychain password somewhere safe: losing them means"
echo "installed copies can never auto-update again."
