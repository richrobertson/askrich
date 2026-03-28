#!/usr/bin/env bash
set -euo pipefail

# Resolve all unresolved review threads on a GitHub PR via GraphQL.
# Usage:
#   GITHUB_TOKEN=... ./scripts/resolve_pr_review_threads_graphql.sh richrobertson askrich 1

OWNER="${1:-}"
REPO="${2:-}"
PR_NUMBER="${3:-}"

if [[ -z "$OWNER" || -z "$REPO" || -z "$PR_NUMBER" ]]; then
  echo "Usage: GITHUB_TOKEN=... $0 <owner> <repo> <pr_number>"
  exit 1
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "GITHUB_TOKEN is required (needs repo scope for private repos; public_repo for public repos)."
  exit 1
fi

api="https://api.github.com/graphql"

query='query($owner:String!, $repo:String!, $pr:Int!){\n  repository(owner:$owner, name:$repo){\n    pullRequest(number:$pr){\n      reviewThreads(first:100){\n        nodes{\n          id\n          isResolved\n          isOutdated\n          path\n        }\n        pageInfo{ hasNextPage endCursor }\n      }\n    }\n  }\n}'

payload=$(jq -n \
  --arg owner "$OWNER" \
  --arg repo "$REPO" \
  --argjson pr "$PR_NUMBER" \
  --arg query "$query" \
  '{query:$query, variables:{owner:$owner, repo:$repo, pr:$pr}}')

response=$(curl -sS -X POST "$api" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$payload")

if [[ "$(echo "$response" | jq 'has("errors")')" == "true" ]]; then
  echo "$response" | jq .
  echo "GraphQL query failed."
  exit 1
fi

mapfile -t thread_ids < <(echo "$response" | jq -r '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | .id')

if [[ ${#thread_ids[@]} -eq 0 ]]; then
  echo "No unresolved review threads found for PR #$PR_NUMBER."
  exit 0
fi

echo "Found ${#thread_ids[@]} unresolved review thread(s). Resolving..."

for tid in "${thread_ids[@]}"; do
  mutation='mutation($threadId:ID!){ resolveReviewThread(input:{threadId:$threadId}){ thread { id isResolved } } }'
  mpayload=$(jq -n --arg mutation "$mutation" --arg tid "$tid" '{query:$mutation, variables:{threadId:$tid}}')
  mresp=$(curl -sS -X POST "$api" \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$mpayload")

  if [[ "$(echo "$mresp" | jq 'has("errors")')" == "true" ]]; then
    echo "Failed to resolve thread $tid"
    echo "$mresp" | jq .
    exit 1
  fi

  resolved=$(echo "$mresp" | jq -r '.data.resolveReviewThread.thread.isResolved')
  echo "Thread $tid resolved=$resolved"
done

echo "Done."
