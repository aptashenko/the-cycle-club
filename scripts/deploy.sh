#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REMOTE_TARGET="root@188.245.207.186"
REMOTE_TARGET="$DEFAULT_REMOTE_TARGET"
BRANCH=""

usage() {
  echo "Usage: $0 [-b|--branch <branch>] [host|user@host]"
  echo "Example: $0"
  echo "Example: $0 example.com"
  echo "Example: $0 root@example.com"
  echo "Example: $0 --branch main root@example.com"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -b|--branch)
      if [[ $# -lt 2 ]]; then
        usage
        exit 1
      fi
      BRANCH="$2"
      shift 2
      ;;
    --branch=*)
      BRANCH="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
    *)
      REMOTE_TARGET="$1"
      shift
      ;;
  esac
done

if [[ -z "$REMOTE_TARGET" ]]; then
  usage
  exit 1
fi

if [[ -n "$BRANCH" && ( "$BRANCH" == -* || ! "$BRANCH" =~ ^[A-Za-z0-9._/-]+$ ) ]]; then
  echo "Invalid branch name: $BRANCH"
  exit 1
fi

if [[ "$REMOTE_TARGET" != *@* ]]; then
  REMOTE_TARGET="root@$REMOTE_TARGET"
fi

if [[ -n "$BRANCH" ]]; then
  ssh "$REMOTE_TARGET" "cd ~/the-cycle-club && git fetch origin '$BRANCH' && git checkout '$BRANCH' && git pull --ff-only origin '$BRANCH' && npm run deploy"
else
  ssh "$REMOTE_TARGET" "cd ~/the-cycle-club && git pull && npm run deploy"
fi
