#!/bin/sh
# Turns release/mac-arm64/Hatch.app into the zip a trial user downloads.
# Apple silicon runs no app without a signature. No Developer ID stands behind this one, so macOS still asks the user to allow the first launch.
# The signing happens in a temporary folder, because a folder macOS syncs (Documents, Desktop) stamps Finder attributes on the app and codesign refuses them.
set -e
cd "$(dirname "$0")/.."
version=$(node -p "require('./package.json').version")
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

ditto --norsrc --noextattr release/mac-arm64/Hatch.app "$work/Hatch.app"
xattr -cr "$work/Hatch.app"
# macOS ties the Keychain's "Always Allow" to the app's signature. An ad-hoc signature changes with every build, so each update
# asked the user again for the saved sign-ins and the Jev key. A signing certificate kept on the release Mac stays the same
# from build to build, so the answer holds across updates. HATCH_SIGN_IDENTITY names another certificate; with none present the
# build falls back to an ad-hoc signature and says so.
identity="${HATCH_SIGN_IDENTITY:-IDEalize Local Signing}"
if security find-identity -v -p codesigning | grep -q "\"$identity\""; then
  codesign --force --deep --sign "$identity" "$work/Hatch.app"
else
  echo "No signing certificate named \"$identity\" on this Mac. Signing ad hoc, so users answer the Keychain again after this update." >&2
  codesign --force --deep --sign - "$work/Hatch.app"
fi
codesign --verify --deep --strict "$work/Hatch.app"

zip="release/Hatch-$version-mac-arm64.zip"
rm -f "$zip"
ditto -c -k --norsrc --keepParent "$work/Hatch.app" "$zip"
echo "Wrote $zip"
