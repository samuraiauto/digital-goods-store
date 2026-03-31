#!/usr/bin/env bash
# Запускать на VPS из-под root, из каталога репозитория или с полным путём:
#   bash /root/digital-goods-store/scripts/vps-update.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
git pull
cd "$ROOT/backend"
npm install --omit=dev
pkill -f "node src/server.js" 2>/dev/null || true
nohup npm run start > /root/digital-goods-backend.log 2>&1 &
sleep 2
curl -sS "http://127.0.0.1:3000/api/health" || true
echo
