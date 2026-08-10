#!/bin/sh
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mkdir -p "$project_root/work/swift-cache" "$project_root/work/swift-config" "$project_root/work/swift-security" "$project_root/work/clang-cache"
CLANG_MODULE_CACHE_PATH="$project_root/work/clang-cache" swift build --disable-sandbox -c release --package-path "$project_root/plugin-stream" --cache-path "$project_root/work/swift-cache" --config-path "$project_root/work/swift-config" --security-path "$project_root/work/swift-security"
