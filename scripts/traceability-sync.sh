#!/usr/bin/env bash
set -euo pipefail

: "${TRACEABILITY_VAULT:?Set TRACEABILITY_VAULT}"
: "${TRACEABILITY_PROJECT:?Set TRACEABILITY_PROJECT}"

ENGRAM_BIN="${ENGRAM_BIN:-$(command -v engram || true)}"
if [[ -z "$ENGRAM_BIN" ]]; then
  echo "Engram CLI not found; set ENGRAM_BIN." >&2
  exit 1
fi

args=(obsidian-export --vault "$TRACEABILITY_VAULT" --project "$TRACEABILITY_PROJECT")
[[ -n "${TRACEABILITY_SINCE:-}" ]] && args+=(--since "$TRACEABILITY_SINCE")
[[ "${TRACEABILITY_FORCE:-false}" == "true" ]] && args+=(--force)
[[ "${TRACEABILITY_WATCH:-false}" == "true" ]] && args+=(--watch --interval "${TRACEABILITY_INTERVAL:-10m}")

if [[ "${TRACEABILITY_DRY_RUN:-false}" == "true" ]]; then
  printf 'DRY RUN: %q ' "$ENGRAM_BIN" "${args[@]}"
  printf '\n'
  exit 0
fi

"$ENGRAM_BIN" "${args[@]}"
[[ "${TRACEABILITY_WATCH:-false}" == "true" ]] && exit 0

CLI="${OBSIDIAN_INTELLIGENCE_CLI:-}"
NODE_BIN="${TRACEABILITY_NODE:-node}"
if [[ -z "$CLI" ]]; then
  CLI="$PWD/node_modules/obsidian-intelligence/vault-intelligence.js"
fi

if [[ ! -f "$CLI" ]]; then
  echo "Engram export completed; Obsidian reindex skipped. Set OBSIDIAN_INTELLIGENCE_CLI." >&2
  exit 0
fi

"$NODE_BIN" "$CLI" index --vault "$TRACEABILITY_VAULT"
"$NODE_BIN" "$CLI" status --vault "$TRACEABILITY_VAULT"
