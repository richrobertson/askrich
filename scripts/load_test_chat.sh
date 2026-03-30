#!/usr/bin/env bash
set -euo pipefail

URL=""
REQUESTS=100
CONCURRENCY=10
TOP_K=5
QUESTION="what measurable outcomes did you deliver at oracle"
HUMOR_MODE="clean_professional"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/load_test_chat.sh --url <chat_api_url> [options]

Options:
  --url <url>            Chat endpoint URL (required)
  --requests <n>         Total requests (default: 100)
  --concurrency <n>      Parallel requests (default: 10)
  --top-k <n>            top_k payload value (default: 5)
  --question <text>      Question payload text
  --humor-mode <value>   Humor mode payload value (default: clean_professional)

Example:
  bash scripts/load_test_chat.sh \
    --url http://127.0.0.1:8787/api/chat \
    --requests 200 \
    --concurrency 20
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)
      URL="${2:-}"
      shift 2
      ;;
    --requests)
      REQUESTS="${2:-}"
      shift 2
      ;;
    --concurrency)
      CONCURRENCY="${2:-}"
      shift 2
      ;;
    --top-k)
      TOP_K="${2:-}"
      shift 2
      ;;
    --question)
      QUESTION="${2:-}"
      shift 2
      ;;
    --humor-mode)
      HUMOR_MODE="${2:-}"
      shift 2
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

if [[ -z "$URL" ]]; then
  echo "Error: --url is required" >&2
  usage
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required" >&2
  exit 1
fi

if ! command -v xargs >/dev/null 2>&1; then
  echo "Error: xargs is required" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

REQ_FILE="$TMP_DIR/requests.txt"
RES_FILE="$TMP_DIR/results.tsv"

seq 1 "$REQUESTS" > "$REQ_FILE"

export URL TOP_K QUESTION HUMOR_MODE

cat "$REQ_FILE" | xargs -I{} -P "$CONCURRENCY" bash -c '
  request_id="$1"
  tmp_dir="$2"
  out_file="$tmp_dir/result_${request_id}.tsv"

  start=$(python3 - <<"PY"
import time
print(int(time.time() * 1000))
PY
)

  payload=$(python3 - <<"PY"
import json
import os

payload = {
  "question": os.environ["QUESTION"],
  "top_k": int(os.environ["TOP_K"]),
  "history": [],
  "humor_mode": os.environ["HUMOR_MODE"],
}
print(json.dumps(payload))
PY
)

  code=$(curl -sS -o /dev/null -w "%{http_code}" "$URL" \
    -H "content-type: application/json" \
    --data "$payload" || echo "000")

  end=$(python3 - <<"PY"
import time
print(int(time.time() * 1000))
PY
)

  elapsed=$((end - start))
  printf "%s\t%s\n" "$code" "$elapsed" > "$out_file"
' _ {} "$TMP_DIR"

find "$TMP_DIR" -name 'result_*.tsv' -type f -print0 | xargs -0 cat > "$RES_FILE"

TOTAL=$(wc -l < "$RES_FILE" | tr -d ' ')
OK=$(awk -F '\t' '$1 ~ /^2/ {c++} END {print c+0}' "$RES_FILE")
ERR=$((TOTAL - OK))

AVG=$(awk -F '\t' '{s+=$2} END {if (NR>0) printf "%.2f", s/NR; else print "0"}' "$RES_FILE")

P50="n/a"
P95="n/a"
P99="n/a"
if [[ "$TOTAL" -gt 0 ]]; then
  LATENCIES_FILE="$TMP_DIR/latencies.txt"
  awk -F '\t' '{print $2}' "$RES_FILE" | sort -n > "$LATENCIES_FILE"

  P50_INDEX=$(( (TOTAL * 50 + 99) / 100 ))
  P95_INDEX=$(( (TOTAL * 95 + 99) / 100 ))
  P99_INDEX=$(( (TOTAL * 99 + 99) / 100 ))

  P50=$(awk -v n="$P50_INDEX" 'NR==n {print $1; exit}' "$LATENCIES_FILE")
  P95=$(awk -v n="$P95_INDEX" 'NR==n {print $1; exit}' "$LATENCIES_FILE")
  P99=$(awk -v n="$P99_INDEX" 'NR==n {print $1; exit}' "$LATENCIES_FILE")
fi

echo "Load test summary"
echo "  URL: $URL"
echo "  Requests: $TOTAL"
echo "  Concurrency: $CONCURRENCY"
echo "  2xx responses: $OK"
echo "  Non-2xx responses: $ERR"
echo "  Latency avg (ms): $AVG"
echo "  Latency p50 (ms): ${P50:-n/a}"
echo "  Latency p95 (ms): ${P95:-n/a}"
echo "  Latency p99 (ms): ${P99:-n/a}"
