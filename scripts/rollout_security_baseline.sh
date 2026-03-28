#!/usr/bin/env bash
set -euo pipefail

# Roll out the Ask Rich GitHub security baseline to multiple repositories.
# Default mode is dry-run to avoid accidental mass changes.
#
# Usage examples:
#   scripts/rollout_security_baseline.sh --owner richrobertson --repos askrich,repo2 --execute
#   scripts/rollout_security_baseline.sh --owner richrobertson --all-public --execute

OWNER=""
REPOS_CSV=""
ALL_PUBLIC=false
EXECUTE=false
BRANCH_PREFIX="chore/security-baseline"
BASE_BRANCH="main"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_DIR="$REPO_ROOT/.github"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

usage() {
  cat <<EOF
Roll out GitHub security baseline to repositories.

Required:
  --owner <github-owner>

One of:
  --repos <comma-separated-repo-names>
  --all-public

Optional:
  --base-branch <branch>          (default: main)
  --branch-prefix <prefix>        (default: chore/security-baseline)
  --execute                       Actually perform writes/push/PR creation (otherwise dry-run)

Examples:
  scripts/rollout_security_baseline.sh --owner richrobertson --repos askrich --execute
  scripts/rollout_security_baseline.sh --owner richrobertson --all-public --execute
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner)
      OWNER="$2"
      shift 2
      ;;
    --repos)
      REPOS_CSV="$2"
      shift 2
      ;;
    --all-public)
      ALL_PUBLIC=true
      shift 1
      ;;
    --base-branch)
      BASE_BRANCH="$2"
      shift 2
      ;;
    --branch-prefix)
      BRANCH_PREFIX="$2"
      shift 2
      ;;
    --execute)
      EXECUTE=true
      shift 1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$OWNER" ]]; then
  echo "--owner is required" >&2
  usage
  exit 1
fi

if [[ -z "$REPOS_CSV" && "$ALL_PUBLIC" == false ]]; then
  echo "Specify either --repos or --all-public" >&2
  usage
  exit 1
fi

require_cmd gh
require_cmd git
require_cmd rsync
require_cmd mktemp

if [[ ! -d "$TEMPLATE_DIR/workflows" ]]; then
  echo "Template workflows not found in $TEMPLATE_DIR/workflows" >&2
  exit 1
fi

BRANCH_NAME="${BRANCH_PREFIX}-$(date +%Y%m%d-%H%M%S)-$RANDOM"

get_repos() {
  if [[ -n "$REPOS_CSV" ]]; then
    tr ',' '\n' <<<"$REPOS_CSV" | sed '/^$/d'
    return
  fi

  gh repo list "$OWNER" --limit 200 --json name,isPrivate --jq '.[] | select(.isPrivate == false) | .name'
}

apply_repo() {
  local repo_name="$1"
  local full_repo="$OWNER/$repo_name"
  local tmpdir
  tmpdir="$(mktemp -d)"

  cleanup_tmpdir() {
    rm -rf "$tmpdir"
  }

  trap cleanup_tmpdir RETURN

  echo ""
  echo "=== Processing $full_repo ==="

  if [[ "$EXECUTE" == false ]]; then
    echo "DRY RUN: would clone, copy baseline, commit, push, and open PR"
    return
  fi

  if ! gh repo view "$full_repo" >/dev/null 2>&1; then
    echo "Skipping: cannot access $full_repo"
    return
  fi

  git clone "https://github.com/$full_repo.git" "$tmpdir/repo" >/dev/null 2>&1
  pushd "$tmpdir/repo" >/dev/null

  if ! git checkout "$BASE_BRANCH" >/dev/null 2>&1; then
    echo "Skipping: base branch '$BASE_BRANCH' not found in $full_repo"
    popd >/dev/null
    return
  fi

  git checkout -b "$BRANCH_NAME" >/dev/null 2>&1

  mkdir -p .github/workflows
  rsync -a "$TEMPLATE_DIR/workflows/" .github/workflows/
  cp "$TEMPLATE_DIR/dependabot.yml" .github/dependabot.yml

  if git diff --quiet; then
    echo "No changes needed for $full_repo"
    popd >/dev/null
    return
  fi

  git add .github/workflows .github/dependabot.yml
  git commit -m "chore: add security baseline (CodeQL, dependency review, secret scan, static analysis, dependabot)" >/dev/null
  git push -u origin "$BRANCH_NAME" >/dev/null 2>&1

  gh pr create \
    --repo "$full_repo" \
    --base "$BASE_BRANCH" \
    --head "$BRANCH_NAME" \
    --title "Add GitHub security baseline" \
    --body "This PR adds a standard security baseline for public repositories:\n\n- CodeQL analysis\n- Dependency review\n- Secret scanning\n- Static analysis checks\n- Dependabot updates for dependencies and actions\n\nGenerated via rollout script." >/dev/null

  echo "Opened PR for $full_repo"

  popd >/dev/null
}

echo "Owner: $OWNER"
echo "Base branch: $BASE_BRANCH"
echo "Branch name: $BRANCH_NAME"
if [[ "$EXECUTE" == false ]]; then
  echo "Mode: DRY RUN (add --execute to perform changes)"
fi

while IFS= read -r repo; do
  [[ -n "$repo" ]] || continue
  apply_repo "$repo"
done < <(get_repos)

echo ""
echo "Rollout complete."
