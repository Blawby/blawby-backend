#!/usr/bin/env bash

set -euo pipefail

# Local account used to create the OAuth client. This user must be an owner of
# its active organization. Do not commit real credentials.
TEST_EMAIL="${TEST_EMAIL:-replace-with-owner@example.com}"
TEST_PASSWORD="${TEST_PASSWORD:-replace-with-owner-password}"

API_ORIGIN="${API_ORIGIN:-http://localhost:3000}"
FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-http://localhost:5173}"
ISSUER="${ISSUER:-${API_ORIGIN%/}/api/auth}"
REDIRECT_URI="${REDIRECT_URI:-http://127.0.0.1:8788/callback}"
SCOPES="${SCOPES:-openid profile email offline_access}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/blawby-oauth-provider.cookies}"

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

step() {
  printf '\n==> %s\n' "$*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command is not installed: $1"
}

json_request() {
  local label="$1"
  shift

  local body_file status
  body_file="$(mktemp)"
  status="$(curl -sS -o "$body_file" -w '%{http_code}' "$@")" || {
    rm -f "$body_file"
    fail "$label request failed. Is the local API server running at $API_ORIGIN?"
  }

  if (( status < 200 || status >= 300 )); then
    printf '%s returned HTTP %s:\n' "$label" "$status" >&2
    jq . "$body_file" 2>/dev/null >&2 || cat "$body_file" >&2
    rm -f "$body_file"
    fail "$label failed."
  fi

  cat "$body_file"
  rm -f "$body_file"
}

require_command curl
require_command jq
require_command openssl
require_command mktemp

if [[ "$TEST_EMAIL" == "replace-with-owner@example.com" || "$TEST_PASSWORD" == "replace-with-owner-password" ]]; then
  fail "Set TEST_EMAIL and TEST_PASSWORD at the top of this script, or pass them as environment variables."
fi

rm -f "$COOKIE_JAR"
touch "$COOKIE_JAR"
chmod 600 "$COOKIE_JAR"

step "Discover OAuth/OIDC endpoints"
DISCOVERY="$(
  json_request "OIDC discovery" \
    "$ISSUER/.well-known/openid-configuration"
)"
echo "$DISCOVERY" | jq '{issuer, authorization_endpoint, token_endpoint, userinfo_endpoint}'

AUTHORIZATION_ENDPOINT="$(echo "$DISCOVERY" | jq -er '.authorization_endpoint')"
TOKEN_ENDPOINT="$(echo "$DISCOVERY" | jq -er '.token_endpoint')"
USERINFO_ENDPOINT="$(echo "$DISCOVERY" | jq -er '.userinfo_endpoint')"

step "Sign in as the owner account and save cookies to $COOKIE_JAR"
SIGN_IN_BODY="$(
  jq -cn \
    --arg email "$TEST_EMAIL" \
    --arg password "$TEST_PASSWORD" \
    '{email: $email, password: $password}'
)"
json_request "Email sign-in" \
  -c "$COOKIE_JAR" \
  -b "$COOKIE_JAR" \
  -H 'content-type: application/json' \
  -H "origin: $FRONTEND_ORIGIN" \
  --data "$SIGN_IN_BODY" \
  "$ISSUER/sign-in/email" >/dev/null

SESSION="$(
  json_request "Get session" \
    -b "$COOKIE_JAR" \
    "$ISSUER/get-session"
)"
ACTIVE_ORGANIZATION_ID="$(echo "$SESSION" | jq -r '.session.active_organization_id // empty')"
[[ -n "$ACTIVE_ORGANIZATION_ID" ]] ||
  fail "Signed in, but the session has no active_organization_id. Use an organization owner account."
printf 'Authenticated with active organization: %s\n' "$ACTIVE_ORGANIZATION_ID"

step "Create a public PKCE OAuth client"
CLIENT_BODY="$(
  jq -cn \
    --arg redirect_uri "$REDIRECT_URI" \
    --arg scope "$SCOPES" \
    '{
      client_name: "Local OAuth Provider smoke test",
      redirect_uris: [$redirect_uri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: $scope
    }'
)"
CLIENT="$(
  json_request "Create OAuth client" \
    -b "$COOKIE_JAR" \
    -H 'content-type: application/json' \
    -H "origin: $FRONTEND_ORIGIN" \
    --data "$CLIENT_BODY" \
    "$ISSUER/oauth2/create-client"
)"
CLIENT_ID="$(echo "$CLIENT" | jq -er '.client_id')"
printf 'Created client: %s\n' "$CLIENT_ID"

step "Generate PKCE values and begin authorization"
VERIFIER="$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n')"
CHALLENGE="$(
  printf '%s' "$VERIFIER" |
    openssl dgst -sha256 -binary |
    openssl base64 -A |
    tr '+/' '-_' |
    tr -d '='
)"
STATE="$(openssl rand -hex 16)"
AUTH_HEADERS="$(mktemp)"
AUTH_BODY="$(mktemp)"
trap 'rm -f "$AUTH_HEADERS" "$AUTH_BODY"' EXIT

curl -sS -o "$AUTH_BODY" -D "$AUTH_HEADERS" -b "$COOKIE_JAR" -G \
  --data-urlencode 'response_type=code' \
  --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "redirect_uri=$REDIRECT_URI" \
  --data-urlencode "scope=$SCOPES" \
  --data-urlencode "state=$STATE" \
  --data-urlencode "code_challenge=$CHALLENGE" \
  --data-urlencode 'code_challenge_method=S256' \
  "$AUTHORIZATION_ENDPOINT" >/dev/null

LOCATION="$(
  awk 'BEGIN { IGNORECASE = 1 } /^location:/ { sub(/\r$/, ""); sub(/^[^:]+:[[:space:]]*/, ""); print; exit }' \
    "$AUTH_HEADERS"
)"
[[ -n "$LOCATION" ]] || {
  cat "$AUTH_BODY" >&2
  fail "Authorization did not return a redirect."
}
printf 'Authorization redirect: %s\n' "${LOCATION%%\?*}"

if [[ "$LOCATION" == *"code="* ]]; then
  CALLBACK_URL="$LOCATION"
else
  OAUTH_QUERY="${LOCATION#*\?}"
  [[ "$OAUTH_QUERY" != "$LOCATION" ]] ||
    fail "Authorization redirect did not include the signed OAuth query required for consent."

  step "Approve consent using the signed query from the redirect"
  CONSENT_BODY="$(
    jq -cn \
      --arg scope "$SCOPES" \
      --arg oauth_query "$OAUTH_QUERY" \
      '{accept: true, scope: $scope, oauth_query: $oauth_query}'
  )"
  CONSENT="$(
    json_request "OAuth consent" \
      -b "$COOKIE_JAR" \
      -H 'content-type: application/json' \
      -H "origin: $FRONTEND_ORIGIN" \
      --data "$CONSENT_BODY" \
      "$ISSUER/oauth2/consent"
  )"
  CALLBACK_URL="$(echo "$CONSENT" | jq -er '.url // .redirect_uri')"
fi

CODE="$(printf '%s' "$CALLBACK_URL" | sed -n 's/.*[?&]code=\([^&]*\).*/\1/p')"
RETURNED_STATE="$(printf '%s' "$CALLBACK_URL" | sed -n 's/.*[?&]state=\([^&]*\).*/\1/p')"
[[ -n "$CODE" ]] || fail "Consent callback did not contain an authorization code."
[[ "$RETURNED_STATE" == "$STATE" ]] || fail "OAuth state returned by the callback did not match."
printf 'Received authorization callback: %s\n' "${CALLBACK_URL%%\?*}"

step "Exchange the authorization code for tokens"
TOKENS="$(
  json_request "Token exchange" \
    --data-urlencode 'grant_type=authorization_code' \
    --data-urlencode "client_id=$CLIENT_ID" \
    --data-urlencode "code=$CODE" \
    --data-urlencode "code_verifier=$VERIFIER" \
    --data-urlencode "redirect_uri=$REDIRECT_URI" \
    "$TOKEN_ENDPOINT"
)"
ACCESS_TOKEN="$(echo "$TOKENS" | jq -er '.access_token')"
REFRESH_TOKEN="$(echo "$TOKENS" | jq -er '.refresh_token')"
echo "$TOKENS" | jq '{token_type, expires_in, scope, has_access_token: has("access_token"), has_id_token: has("id_token"), has_refresh_token: has("refresh_token")}'

step "Call the OIDC userinfo endpoint"
json_request "UserInfo" \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  "$USERINFO_ENDPOINT" | jq

step "Refresh the access token"
REFRESHED="$(
  json_request "Refresh token exchange" \
    --data-urlencode 'grant_type=refresh_token' \
    --data-urlencode "client_id=$CLIENT_ID" \
    --data-urlencode "refresh_token=$REFRESH_TOKEN" \
    "$TOKEN_ENDPOINT"
)"
echo "$REFRESHED" | jq '{token_type, expires_in, scope, has_access_token: has("access_token"), has_id_token: has("id_token"), has_refresh_token: has("refresh_token")}'

printf '\nOAuth Provider local smoke test passed. Cookies remain at %s\n' "$COOKIE_JAR"
