#!/bin/zsh
set -eu
project_root=${0:A:h}
cd "$project_root"
clear
echo "REAPER Touch Remote"
echo "Keep this window open while using the iPad."
echo
./scripts/start.sh
exit_code=$?
echo
echo "Server stopped (code $exit_code). Press Return to close."
read -r
