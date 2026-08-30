#!/usr/bin/env bash
# Packages the plugin into a standard installable .zip: unzipping it at the
# root of wp-content/plugins/ creates wp-content/plugins/crawlpay/...
#
# Usage: ./build/build.sh [output-dir]   (default output-dir: build/dist)
set -euo pipefail

PLUGIN_SLUG="crawlpay"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="${1:-$PLUGIN_DIR/build/dist}"

if ! command -v zip >/dev/null 2>&1; then
  echo "error: this script requires 'zip' on PATH (standard on macOS/Linux; on Windows use WSL or Git Bash with zip installed)." >&2
  exit 1
fi

VERSION=$(grep -m1 "Version:" "$PLUGIN_DIR/crawlpay.php" | sed -E 's/.*Version:[[:space:]]*([0-9A-Za-z.\-]+).*/\1/')
if [ -z "$VERSION" ]; then
  echo "error: could not determine plugin version from crawlpay.php header" >&2
  exit 1
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

STAGE_DIR="$WORK_DIR/$PLUGIN_SLUG"
mkdir -p "$STAGE_DIR"
cp -r "$PLUGIN_DIR"/. "$STAGE_DIR"/

# Ship only what a real WordPress install needs -- no tests, build tooling,
# dev dependencies, or version control metadata.
rm -rf \
  "$STAGE_DIR/build" \
  "$STAGE_DIR/tests" \
  "$STAGE_DIR/vendor" \
  "$STAGE_DIR/node_modules" \
  "$STAGE_DIR/.git" \
  "$STAGE_DIR/composer.json" \
  "$STAGE_DIR/composer.lock" \
  "$STAGE_DIR/phpunit.xml.dist"
find "$STAGE_DIR" -name "*.zip" -delete

mkdir -p "$OUTPUT_DIR"
ZIP_PATH="$OUTPUT_DIR/${PLUGIN_SLUG}-${VERSION}.zip"
rm -f "$ZIP_PATH"

(cd "$WORK_DIR" && zip -rq "$ZIP_PATH" "$PLUGIN_SLUG")

echo "Built $ZIP_PATH"
