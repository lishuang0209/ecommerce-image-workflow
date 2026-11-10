#!/usr/bin/env bash
# Start backend (http://127.0.0.1:8000) and frontend dev server (http://localhost:3000) together.
# Ctrl+C stops both.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  trap - INT TERM EXIT
  kill 0 2>/dev/null || true
}
trap cleanup INT TERM EXIT

(cd "$ROOT_DIR/backend" && uv run python api_server.py) &
(cd "$ROOT_DIR/frontend" && npm run dev) &

wait
