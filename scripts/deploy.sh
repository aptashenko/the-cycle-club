#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REMOTE_TARGET="root@188.245.207.186"
REMOTE_TARGET="${1:-$DEFAULT_REMOTE_TARGET}"

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
