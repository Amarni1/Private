#!/usr/bin/env bash
set -euo pipefail

# One-time WSL bootstrap for the USDM Private Escrow project.
# Usage (inside WSL Ubuntu):
#   bash /mnt/c/Users/hp/Documents/"Default Project"/usdm-private-escrow/scripts/wsl-setup.sh

PROJECT_DIR="/mnt/c/Users/hp/Documents/Default Project/usdm-private-escrow"

echo "==> Installing prerequisites"
sudo apt-get update -y
sudo apt-get install -y curl tar xz-utils

echo "==> Installing the Compact toolchain"
if ! command -v compact >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
  export PATH="$HOME/.compact/bin:$PATH"
  echo 'export PATH="$HOME/.compact/bin:$PATH"' >> "$HOME/.bashrc"
fi
compact update 0.31.1
compact --version
compact compile --version

echo "==> Compiling contracts/escrow.compact into the project (src/managed/escrow)"
cd "$PROJECT_DIR"
compact compile contracts/escrow.compact src/managed/escrow
ls -la src/managed/escrow

echo "==> Best-effort: run the proof server WITHOUT Docker"
# The proof server is only published as a Docker image (midnightntwrk/proof-server:8.1.0).
# Pull its linux/amd64 layers straight from the registry and run the binary.
PROOF_URL="${MIDNIGHT_PROOF_SERVER:-}"
if [ -n "$PROOF_URL" ]; then
  echo "MIDNIGHT_PROOF_SERVER already set to $PROOF_URL - skipping local extraction."
  exit 0
fi
WORK="/tmp/proof-server"
mkdir -p "$WORK/layers"
TOKEN=$(curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:midnightntwrk/proof-server:pull" | sed -E 's/.*"token":"([^"]+)".*/\1/')
AUTH="Authorization: Bearer $TOKEN"
MANIFEST_LIST=$(curl -s -H "$AUTH" -H "Accept: application/vnd.docker.distribution.manifest.list.v2+json" \
  https://registry-1.docker.io/v2/midnightntwrk/proof-server/manifests/8.1.0)
AMD64_DIGEST=$(echo "$MANIFEST_LIST" | grep -o '"digest":"sha256:[a-f0-9]*"[^}]*"architecture":"amd64"' | grep -o 'sha256:[a-f0-9]*' | head -1)
if [ -z "$AMD64_DIGEST" ]; then
  echo "Could not locate the linux/amd64 manifest for the proof server. Install Docker and run:"
  echo "  docker run -p 6300:6300 midnightntwrk/proof-server:8.1.0 midnight-proof-server -v"
  exit 0
fi
MANIFEST=$(curl -s -H "$AUTH" -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
  "https://registry-1.docker.io/v2/midnightntwrk/proof-server/manifests/$AMD64_DIGEST")
for LAYER in $(echo "$MANIFEST" | grep -o '"digest":"sha256:[a-f0-9]*"' | sed -E 's/.*"sha256:([a-f0-9]+)".*/\1/'); do
  curl -sL -H "$AUTH" "https://registry-1.docker.io/v2/midnightntwrk/proof-server/blobs/sha256:$LAYER" -o "$WORK/layers/$LAYER"
  tar -xf "$WORK/layers/$LAYER" -C "$WORK" 2>/dev/null || true
done
BINARY=$(find "$WORK" -type f -name 'midnight-proof-server' | head -1)
if [ -z "$BINARY" ]; then
  echo "Could not extract the proof-server binary from the image layers. Install Docker and run the image instead."
  exit 0
fi
chmod +x "$BINARY"
echo "Proof server binary: $BINARY"
echo "Starting proof server on 127.0.0.1:6300 ..."
"$BINARY" -v