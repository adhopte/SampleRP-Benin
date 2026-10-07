#!/usr/bin/env bash
# The whole RP <-> wallet exchange with curl, to understand each HTTP call.
# Usage: BASE=http://localhost:3000 ./samples/curl-walkthrough.sh [pid|birth_certificate]
set -euo pipefail
BASE=${BASE:-http://localhost:3000}
PROFILE=${1:-pid}

echo "1) Create a verification session"
SESSION=$(curl -s -X POST "$BASE/api/session" -H 'content-type: application/json' -d "{\"profile\":\"$PROFILE\"}")
echo "$SESSION"
ID=$(echo "$SESSION" | sed -E 's/.*"sessionId":"([^"]+)".*/\1/')
LINK=$(echo "$SESSION" | sed -E 's/.*"authorizationRequestUri":"([^"]+)".*/\1/')

echo; echo "2) What the wallet fetches from request_uri (a JWT; payload decoded below)"
REQ_URI=$(node -e "console.log(new URL(process.argv[1].replace('openid4vp://','https://w/')).searchParams.get('request_uri'))" "$LINK")
curl -s "$REQ_URI" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.stringify(JSON.parse(Buffer.from(d.split('.')[1],'base64url')),null,2)))"

echo; echo "3) A (mock) wallet posts its presentation to response_uri"
node "$(dirname "$0")/../tools/mock-wallet.js" "$LINK"

echo; echo "4) Poll the outcome"
curl -s "$BASE/api/session/$ID"; echo
