#!/usr/bin/env bash
#
# Mode A live verification: bring up the CrawlPay middleware as a real reverse
# proxy in front of a real WordPress (infra/docker-compose.test-mode-a.yml),
# run the payment-gate + passthrough assertions against it, tear the stack
# down. Exit code = number of failed assertions (0 = all passed).
#
# Usage:  infra/mode-a/test-mode-a.sh  [--keep]
#   --keep   leave the stack running after the assertions (for debugging)
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

COMPOSE=(docker compose -f infra/docker-compose.test-mode-a.yml)
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

MW="http://localhost:8787"
WP_DIRECT="http://localhost:8780"
HUMAN_UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
GPTBOT_UA="Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)"
WORK="$(mktemp -d)"

PASS=0
FAIL=0
declare -a RESULTS

record() { # name  ok(0|1)  detail
  if [ "$2" -eq 0 ]; then
    echo "  PASS  $1  --  $3"
    PASS=$((PASS + 1))
    RESULTS+=("PASS | $1 | $3")
  else
    echo "  FAIL  $1  --  $3"
    FAIL=$((FAIL + 1))
    RESULTS+=("FAIL | $1 | $3")
  fi
}

teardown() {
  if [ "$KEEP" -eq 1 ]; then
    echo "--keep set: leaving the stack up. Tear down with:"
    echo "  ${COMPOSE[*]} down -v --remove-orphans"
  else
    echo "== Tearing down =="
    "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
}
trap teardown EXIT

wpcli() { "${COMPOSE[@]}" run --rm -T wpcli wp "$@"; }

wait_for() { # description  url  max_attempts
  local desc="$1" url="$2" max="${3:-60}" i
  for ((i = 1; i <= max; i++)); do
    if curl -fsS -o /dev/null "$url"; then
      echo "  ready: $desc"
      return 0
    fi
    sleep 2
  done
  echo "  TIMED OUT waiting for $desc ($url)"
  return 1
}

# ---------------------------------------------------------------------------
echo "== Building + starting the stack =="
"${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
if ! "${COMPOSE[@]}" up -d --build; then
  echo "docker compose up failed"
  "${COMPOSE[@]}" ps
  exit 99
fi

echo "== Waiting for services =="
wait_for "WordPress (direct)" "$WP_DIRECT/wp-login.php" 60 || { "${COMPOSE[@]}" logs wordpress | tail -50; exit 99; }

echo "== Installing WordPress =="
for ((i = 1; i <= 30; i++)); do
  wpcli core version >/dev/null 2>&1 && break
  sleep 2
done
if wpcli core is-installed >/dev/null 2>&1; then
  echo "  already installed"
else
  wpcli core install \
    --url="$MW" \
    --title="CrawlPay Mode A Test" \
    --admin_user="admin" \
    --admin_password="admin123" \
    --admin_email="admin@example.com" \
    --skip-email
fi
# Pretty permalinks so /wp-json/... resolves without the ?rest_route= fallback.
wpcli rewrite structure '/%postname%/' >/dev/null 2>&1 || true
wpcli rewrite flush --hard >/dev/null 2>&1 || true

wait_for "middleware /health" "$MW/health" 60 || { "${COMPOSE[@]}" logs middleware | tail -50; exit 99; }

echo
echo "== Assertions =="

# --- 1. Human request -> 200, serves WordPress homepage --------------------
code=$(curl -s -o "$WORK/1" -w '%{http_code}' -A "$HUMAN_UA" "$MW/")
if [ "$code" = "200" ] && grep -qiE '<html|<!doctype html' "$WORK/1"; then
  record "1 human GET / -> 200 + WP homepage" 0 "code=$code, $(wc -c <"$WORK/1") bytes of HTML"
else
  record "1 human GET / -> 200 + WP homepage" 1 "code=$code, body head: $(head -c 160 "$WORK/1" | tr -d '\n')"
fi

# --- 2. GPTBot request -> 402 with a valid x402 manifest ------------------
code=$(curl -s -o "$WORK/2" -w '%{http_code}' -A "$GPTBOT_UA" "$MW/")
nonce=$(jq -r '.accepts[0].nonce // empty' "$WORK/2" 2>/dev/null || true)
scheme=$(jq -r '.accepts[0].scheme // empty' "$WORK/2" 2>/dev/null || true)
x402ver=$(jq -r '.x402Version // empty' "$WORK/2" 2>/dev/null || true)
if [ "$code" = "402" ] && [ "$scheme" = "exact" ] && [ -n "$nonce" ] && [ "$x402ver" = "1" ]; then
  record "2 GPTBot GET / -> 402 x402 manifest" 0 "nonce=$nonce, asset=$(jq -r '.accepts[0].asset' "$WORK/2")"
else
  record "2 GPTBot GET / -> 402 x402 manifest" 1 "code=$code x402Version='$x402ver' scheme='$scheme' nonce='$nonce'"
fi

# --- 3. GPTBot + valid proof -> 200, serves WordPress homepage ------------
[ -n "$nonce" ] || nonce="00000000-0000-4000-8000-000000000000"
proof=$(printf '{"x402Version":1,"scheme":"exact","network":"base-sepolia","nonce":"%s","payload":{"payer":"0xTESTPAYER0000000000000000000000000000"}}' "$nonce")
xpay=$(printf '%s' "$proof" | base64 | tr -d '\n' | tr '+/' '-_' | tr -d '=')
code=$(curl -s -o "$WORK/3" -w '%{http_code}' -A "$GPTBOT_UA" -H "X-Payment: $xpay" "$MW/")
if [ "$code" = "200" ] && grep -qiE '<html|<!doctype html' "$WORK/3"; then
  record "3 GPTBot + proof -> 200 + WP homepage" 0 "code=$code, paid path served origin"
else
  record "3 GPTBot + proof -> 200 + WP homepage" 1 "code=$code, body head: $(head -c 160 "$WORK/3" | tr -d '\n')"
fi

# --- 4. WordPress admin login via middleware -> works, cookie set --------
curl -s -o /dev/null -c "$WORK/cj" -A "$HUMAN_UA" "$MW/wp-login.php" || true
code=$(curl -s -o "$WORK/4" -D "$WORK/4h" -w '%{http_code}' -A "$HUMAN_UA" \
  -b "$WORK/cj" -c "$WORK/cj" \
  --data-urlencode "log=admin" \
  --data-urlencode "pwd=admin123" \
  --data-urlencode "wp-submit=Log In" \
  --data-urlencode "redirect_to=$MW/wp-admin/" \
  --data-urlencode "testcookie=1" \
  "$MW/wp-login.php")
authcookie=$(grep -ci 'set-cookie:.*wordpress_logged_in' "$WORK/4h" 2>/dev/null || true)
authcookie=${authcookie:-0}
if { [ "$code" = "302" ] || [ "$code" = "200" ]; } && [ "$authcookie" -ge 1 ]; then
  record "4 admin login via middleware -> auth cookie" 0 "code=$code, Set-Cookie wordpress_logged_in present"
else
  record "4 admin login via middleware -> auth cookie" 1 "code=$code, wordpress_logged_in Set-Cookie=$authcookie  (middleware serves GET only; a login POST is not proxied)"
fi

# --- 5. Media upload via middleware -> file saved ------------------------
printf 'mode-a upload probe %s' "$(date +%s)" >"$WORK/upload.txt"
code=$(curl -s -o "$WORK/5" -w '%{http_code}' -A "$HUMAN_UA" -b "$WORK/cj" \
  -F "name=upload.txt" \
  -F "async-upload=@$WORK/upload.txt;type=text/plain" \
  -F "action=upload-attachment" \
  "$MW/wp-admin/async-upload.php")
if [ "$code" = "200" ] && jq -e '.success == true' "$WORK/5" >/dev/null 2>&1; then
  record "5 media upload via middleware -> saved" 0 "code=$code, attachment id=$(jq -r '.data.id' "$WORK/5")"
else
  record "5 media upload via middleware -> saved" 1 "code=$code  (multipart POST is not proxied; also needs the auth cookie from #4)"
fi

# --- 6. REST API call via middleware -> JSON returned -------------------
code=$(curl -s -o "$WORK/6" -w '%{http_code}' -A "$HUMAN_UA" "$MW/wp-json/wp/v2/posts")
if [ "$code" = "200" ] && jq -e 'type == "array"' "$WORK/6" >/dev/null 2>&1; then
  record "6 REST GET /wp-json/wp/v2/posts -> 200 JSON" 0 "code=$code, $(jq 'length' "$WORK/6") post(s)"
else
  record "6 REST GET /wp-json/wp/v2/posts -> 200 JSON" 1 "code=$code, body head: $(head -c 160 "$WORK/6" | tr -d '\n')"
fi

# --- 7. Conditional request from an unpaid GPTBot -> NOT 304 -----------
etag=$(curl -s -D - -o /dev/null -A "$HUMAN_UA" "$MW/" | tr -d '\r' | awk 'tolower($1)=="etag:"{print $2}')
[ -n "$etag" ] || etag='"mode-a-probe"'
code=$(curl -s -o /dev/null -w '%{http_code}' -A "$GPTBOT_UA" -H "If-None-Match: $etag" "$MW/")
if [ "$code" != "304" ]; then
  record "7 If-None-Match, unpaid GPTBot -> not 304" 0 "code=$code (payment gate runs before any conditional handling)"
else
  record "7 If-None-Match, unpaid GPTBot -> not 304" 1 "got 304 -- an unpaid crawler was let through on cache revalidation"
fi

# ---------------------------------------------------------------------------
echo
echo "== Summary =="
printf '%s\n' "${RESULTS[@]}" | column -t -s '|'
echo
echo "$PASS passed, $FAIL failed"
exit "$FAIL"
