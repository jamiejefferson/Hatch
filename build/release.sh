#!/bin/sh
# Turns release/mac-arm64/Hatch.app into the zip a trial user downloads.
# Apple silicon runs no app without a signature, so the copy gets an ad-hoc one. No Developer ID stands behind it, and macOS still asks the user to allow the first launch.
# The signing happens in a temporary folder, because a folder macOS syncs (Documents, Desktop) stamps Finder attributes on the app and codesign refuses them.
set -e
cd "$(dirname "$0")/.."
version=$(node -p "require('./package.json').version")
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

ditto --norsrc --noextattr release/mac-arm64/Hatch.app "$work/Hatch.app"
xattr -cr "$work/Hatch.app"
codesign --force --deep --sign - "$work/Hatch.app"
codesign --verify --deep --strict "$work/Hatch.app"

zip="release/Hatch-$version-mac-arm64.zip"
rm -f "$zip"
ditto -c -k --norsrc --keepParent "$work/Hatch.app" "$zip"
echo "Wrote $zip"
