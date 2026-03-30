#!/usr/bin/env bash
set -euo pipefail

# Provisions Cloudflare KV namespaces for Ask Rich environments and prints IDs.
# Requires Wrangler authentication (npx wrangler login).

CONFIG_PATH="apps/api/worker/wrangler.toml"
PREFIX="askrich-events"
ENVS=(dev staging prod)

usage() {
  cat <<'EOF'
Usage: scripts/provision_kv_namespaces.sh [options]

Options:
  --config <path>     Wrangler config path (default: apps/api/worker/wrangler.toml)
  --prefix <name>     KV namespace name prefix (default: askrich-events)
  --envs <csv>        Environments to create (default: dev,staging,prod)
  --help              Show this help message

Examples:
  scripts/provision_kv_namespaces.sh
  scripts/provision_kv_namespaces.sh --prefix myapp-events
  scripts/provision_kv_namespaces.sh --envs dev,staging
EOF
}

parse_envs() {
  local csv="$1"
  IFS=',' read -r -a ENVS <<< "$csv"
}

extract_id() {
  local output="$1"
  printf '%s\n' "$output" | sed -nE 's/.*id[[:space:]]*=[[:space:]]*"([a-f0-9]{32})".*/\1/p' | head -n1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CONFIG_PATH="$2"
      shift 2
      ;;
    --prefix)
      PREFIX="$2"
      shift 2
      ;;
    --envs)
      parse_envs "$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! command -v npx >/dev/null 2>&1; then
  echo "Error: npx is required but not found in PATH." >&2
  exit 1
fi

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "Error: config file not found: $CONFIG_PATH" >&2
  exit 1
fi

echo "Provisioning Cloudflare KV namespaces"
echo "  config: $CONFIG_PATH"
echo "  prefix: $PREFIX"
echo "  envs:   ${ENVS[*]}"
echo

for env in "${ENVS[@]}"; do
  namespace_name="${PREFIX}-${env}"

  echo "==> Creating namespace for '$env': $namespace_name"
  create_output=$(npx wrangler kv namespace create "$namespace_name" --config "$CONFIG_PATH" --env "$env" 2>&1 || true)
  create_id=$(extract_id "$create_output")

  if [[ -z "$create_id" ]]; then
    echo "$create_output"
    echo "Error: failed to create namespace for '$env'." >&2
    exit 1
  fi

  preview_name="${namespace_name}-preview"
  echo "==> Creating preview namespace for '$env': $preview_name"
  preview_output=$(npx wrangler kv namespace create "$preview_name" --preview --config "$CONFIG_PATH" --env "$env" 2>&1 || true)
  preview_id=$(extract_id "$preview_output")

  if [[ -z "$preview_id" ]]; then
    echo "$preview_output"
    echo "Error: failed to create preview namespace for '$env'." >&2
    exit 1
  fi

  cat <<EOF

[$env]
id = "$create_id"
preview_id = "$preview_id"

EOF
done

echo "Done. Update the [[env.<name>.kv_namespaces]] blocks in $CONFIG_PATH with the IDs above."