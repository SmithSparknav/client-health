#!/bin/zsh

set -e

DASHBOARD_DIR="${0:A:h}"
PORT=8000

cd "$DASHBOARD_DIR"

echo "Starting the SparkNav Account Management Metrics Dashboard..."
echo "Keep this window open while using the dashboard."
echo "Dashboard URL: http://localhost:${PORT}/"

(sleep 1; open "http://localhost:${PORT}/") &
python3 -m http.server "$PORT"
