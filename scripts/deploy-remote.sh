#!/usr/bin/env bash
set -euo pipefail

REMOTE_TARGET="${1:-}"

if [[ -z "$REMOTE_TARGET" ]]; then
  echo "Usage: $0 <host|user@host>"
  echo "Example: $0 example.com"
  echo "Example: $0 root@example.com"
  exit 1
fi

if [[ "$REMOTE_TARGET" != *@* ]]; then
  REMOTE_TARGET="root@$REMOTE_TARGET"
fi

ssh "$REMOTE_TARGET" "cd ~/the-cycle-club && git pull && npm run deploy"
