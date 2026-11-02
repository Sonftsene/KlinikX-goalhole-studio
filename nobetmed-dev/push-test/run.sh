#!/usr/bin/env bash
# NöbetMed push/SW testleri. Kullanım: bash run.sh [geçici-klasör]
set -u
cd "$(dirname "$0")"
TMPD="${1:-${TMPDIR:-/tmp}}"
mkdir -p "$TMPD"
LOG="$TMPD/fake-push-log.json"
rm -f "$LOG"
rc=0
php unit-test.php || rc=1
FAKE_PUSH_LOG="$LOG" php -S 127.0.0.1:8072 fake-push.php >"$TMPD/fake-push.out" 2>&1 &
PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:8072/ && break; sleep 0.1; done
php send-test.php "$LOG" || rc=1
echo "--- curl olmadan (stream bağlamı):"
rm -f "$LOG"
php -d disable_functions=curl_multi_init send-test.php "$LOG" || rc=1
kill "$PID" 2>/dev/null
NM_TMP="$TMPD" node sw-test.cjs || rc=1
exit $rc
