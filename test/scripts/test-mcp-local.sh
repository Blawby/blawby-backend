#!/usr/bin/env bash
# End-to-end MCP OAuth flow test (local dev)
# Usage: ./scripts/test-mcp-local.sh
# Prerequisites:
#   1. Dev server running: pnpm run dev
#   2. Valid user in DB (email + password)

set -euo pipefail

# ── Config — edit these ───────────────────────────────────────────────────────
BASE_URL="http://localhost:3000"
USER_EMAIL="kaze.dev01@gmail.com"
USER_PASSWORD="test@123"
CLIENT_ID="local-mcp-test"
CLIENT_SECRET="local-secret"
REDIRECT_URI="http://localhost:9999/callback"
SCOPES="matters:read matters:write clients:read invoices:read"
# ─────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

fail() { echo -e "${RED}FAIL: $1${NC}" >&2; exit 1; }
ok()   { echo -e "${GREEN}OK: $1${NC}"; }
info() { echo -e "${YELLOW}>> $1${NC}"; }
hr()   { echo "──────────────────────────────────────────────"; }

echo ""
echo "MCP LOCAL TEST"
echo "Base URL : $BASE_URL"
echo "User     : $USER_EMAIL"
hr

# ── STEP 1: Sign in ───────────────────────────────────────────────────────────
echo ""
info "STEP 1 — Sign in with email/password"
echo "POST $BASE_URL/api/auth/sign-in/email"
echo ""

SIGNIN_RESPONSE=$(curl -s -i -X POST "$BASE_URL/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\"}")

echo "--- Response ---"
echo "$SIGNIN_RESPONSE"
echo "----------------"

SESSION_COOKIE=$(echo "$SIGNIN_RESPONSE" | grep -i "^set-cookie:" | grep -o '__Secure-better-auth\.session_token=[^;]*\|better-auth\.session_token=[^;]*' | grep -v '_multi' | head -1)
if [[ -z "$SESSION_COOKIE" ]]; then
  fail "No session cookie in response. Check credentials or server is running."
fi
ok "Session cookie: $SESSION_COOKIE"
hr

# ── STEP 2: List organizations ────────────────────────────────────────────────
echo ""
info "STEP 2 — List organizations (pick org to use)"
echo "GET $BASE_URL/api/auth/organization/list"
echo ""

LIST_ORGS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/auth/organization/list" \
  -H "Cookie: $SESSION_COOKIE")

echo "--- Response ---"
echo "$LIST_ORGS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$LIST_ORGS_RESPONSE"
echo "----------------"

ORG_ID=$(echo "$LIST_ORGS_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
orgs = data if isinstance(data, list) else data.get('organizations', [])
if orgs: print(orgs[0]['id'])
" 2>/dev/null || true)

if [[ -z "$ORG_ID" ]]; then
  fail "Could not parse org ID from response."
fi
ok "Using org ID: $ORG_ID"
hr

# ── STEP 3: Set active organization ──────────────────────────────────────────
echo ""
info "STEP 3 — Set active organization"
echo "POST $BASE_URL/api/auth/organization/set-active"
echo ""

SET_ACTIVE_RESPONSE=$(curl -s -i -X POST "$BASE_URL/api/auth/organization/set-active" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d "{\"organizationId\":\"$ORG_ID\"}")

echo "--- Response ---"
echo "$SET_ACTIVE_RESPONSE"
echo "----------------"

NEW_COOKIE=$(echo "$SET_ACTIVE_RESPONSE" | grep -i "^set-cookie:" | grep -o '__Secure-better-auth\.session_token=[^;]*\|better-auth\.session_token=[^;]*' | grep -v '_multi' | head -1)
if [[ -n "$NEW_COOKIE" ]]; then
  SESSION_COOKIE="$NEW_COOKIE"
  ok "Session cookie updated"
else
  ok "Session cookie unchanged"
fi
hr

# ── STEP 4: OAuth2 authorize — get code ──────────────────────────────────────
echo ""
info "STEP 4 — OAuth2 authorize (get authorization code)"
echo "GET $BASE_URL/api/auth/oauth2/authorize?..."
echo ""

AUTH_URL="$BASE_URL/api/auth/oauth2/authorize"
AUTH_URL+="?response_type=code"
AUTH_URL+="&client_id=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$CLIENT_ID'))")"
AUTH_URL+="&redirect_uri=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$REDIRECT_URI'))")"
AUTH_URL+="&scope=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$SCOPES'))")"
AUTH_URL+="&state=teststate123"

echo "URL: $AUTH_URL"
echo ""

AUTH_RESPONSE=$(curl -s -i -X GET "$AUTH_URL" \
  -H "Cookie: $SESSION_COOKIE" \
  --max-redirs 0 2>&1 || true)

echo "--- Response ---"
echo "$AUTH_RESPONSE"
echo "----------------"

LOCATION=$(echo "$AUTH_RESPONSE" | grep -i "^location:" | head -1)
echo "Location header: $LOCATION"

AUTH_CODE=$(echo "$LOCATION" | grep -o 'code=[^& ]*' | cut -d= -f2 | tr -d '\r')

# If redirected to consent page, auto-submit consent
if [[ -z "$AUTH_CODE" ]] && echo "$LOCATION" | grep -q "consent"; then
  info "Consent page detected — submitting consent automatically"
  CONSENT_STATE=$(echo "$LOCATION" | grep -o 'state=[^& ]*' | cut -d= -f2 | tr -d '\r')
  CONSENT_RESPONSE=$(curl -s -i -X POST "$BASE_URL/api/auth/oauth2/consent" \
    -H "Content-Type: application/json" \
    -H "Cookie: $SESSION_COOKIE" \
    -d "{\"accept\": true, \"state\": \"$CONSENT_STATE\"}")
  echo "--- Consent Response ---"
  echo "$CONSENT_RESPONSE"
  echo "------------------------"
  LOCATION=$(echo "$CONSENT_RESPONSE" | grep -i "^location:" | head -1)
  AUTH_CODE=$(echo "$LOCATION" | grep -o 'code=[^& ]*' | cut -d= -f2 | tr -d '\r')
fi

if [[ -z "$AUTH_CODE" ]]; then
  fail "No 'code' in Location header. Check session cookie is valid."
fi
ok "Authorization code: $AUTH_CODE"
hr

# ── STEP 5: Exchange code for access token ────────────────────────────────────
echo ""
info "STEP 5 — Exchange code for access token"
echo "POST $BASE_URL/api/auth/oauth2/token"
echo ""

TOKEN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=$AUTH_CODE" \
  -d "redirect_uri=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$REDIRECT_URI'))")" \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "resource=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$BASE_URL/mcp'))")")

echo "--- Response ---"
echo "$TOKEN_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$TOKEN_RESPONSE"
echo "----------------"

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('access_token', ''))
" 2>/dev/null || true)

if [[ -z "$ACCESS_TOKEN" ]]; then
  fail "No access_token in response."
fi
ok "Access token obtained (first 40 chars): ${ACCESS_TOKEN:0:40}..."
hr

# ── STEP 6: Call MCP — tools/list ────────────────────────────────────────────
echo ""
info "STEP 6 — MCP tools/list"
echo "POST $BASE_URL/mcp"
echo ""

MCP_RESPONSE=$(curl -s -X POST "$BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}')

echo "--- Response ---"
echo "$MCP_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$MCP_RESPONSE"
echo "----------------"

# SSE response: extract JSON from "data: {...}" line
MCP_JSON=$(echo "$MCP_RESPONSE" | grep '^data:' | head -1 | sed 's/^data: //')
if [[ -z "$MCP_JSON" ]]; then
  MCP_JSON="$MCP_RESPONSE"
fi

TOOL_COUNT=$(echo "$MCP_JSON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
tools = data.get('result', {}).get('tools', [])
print(len(tools))
" 2>/dev/null || echo "0")

if [[ "$TOOL_COUNT" -gt 0 ]]; then
  ok "MCP tools registered: $TOOL_COUNT"
  echo ""
  echo "Tool names:"
  echo "$MCP_JSON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for t in data.get('result', {}).get('tools', []):
    print('  -', t['name'], '|', t.get('description',''))
"
else
  fail "No tools returned. Check MCP_TOOLS_REGISTRY is non-empty and token scopes match."
fi

hr
echo ""
ok "All steps passed. MCP flow working."
echo ""
