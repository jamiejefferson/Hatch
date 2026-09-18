#!/bin/sh
# Installs the latest Hatch into /Applications and opens it.
#   curl -fsSL https://raw.githubusercontent.com/jamiejefferson/hatch/main/install.sh | sh
# A download made by curl carries no quarantine mark, so macOS opens Hatch with no warning.
set -e

REPO="jamiejefferson/hatch"
DEST="${HATCH_INSTALL_DIR:-/Applications}"

[ "$(uname -s)" = "Darwin" ] || { echo "Hatch runs on macOS only."; exit 1; }
[ "$(uname -m)" = "arm64" ] || { echo "This build of Hatch needs a Mac with Apple silicon."; exit 1; }
[ -w "$DEST" ] || { echo "This account cannot write to $DEST. Ask an administrator, or set HATCH_INSTALL_DIR to a folder of your own."; exit 1; }

echo "Finding the latest Hatch..."
url=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"browser_download_url"' | grep 'mac-arm64\.zip"' | head -1 | cut -d '"' -f 4)
[ -n "$url" ] || { echo "No download was found. Get Hatch from https://github.com/$REPO/releases/latest"; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
echo "Downloading $(basename "$url")..."
curl -fL --progress-bar "$url" -o "$work/hatch.zip"
ditto -x -k "$work/hatch.zip" "$work"
[ -d "$work/Hatch.app" ] || { echo "The download held no Hatch.app."; exit 1; }

# A running Hatch saves its workspace as it quits, and the new one opens the same pages.
if pgrep -f "$DEST/Hatch.app/Contents/MacOS/Hatch" >/dev/null 2>&1; then
  echo "Closing the Hatch that is open..."
  osascript -e 'tell application "Hatch" to quit' >/dev/null 2>&1 || true
  sleep 3
fi

rm -rf "$DEST/Hatch.app"
ditto "$work/Hatch.app" "$DEST/Hatch.app"
xattr -dr com.apple.quarantine "$DEST/Hatch.app" 2>/dev/null || true

echo "Hatch is in $DEST. Opening it now."
[ -n "$HATCH_INSTALL_NO_OPEN" ] || open "$DEST/Hatch.app"
