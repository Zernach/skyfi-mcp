#!/bin/bash

# Test script for MCP endpoint
# Usage: ./test_mcp.sh [input_text] [base_url] [method]
# Example: ./test_mcp.sh "Hello, MCP!" http://localhost:3000

set -e

# Default values
INPUT_TEXT="${1:-test input}"
BASE_URL="${2:-http://localhost:3000}"
METHOD="${3:-ping}"
MCP_ENDPOINT="${BASE_URL}/mcp/message"

# Generate a unique request ID
REQUEST_ID=$(date +%s)

# Create JSON-RPC 2.0 request
# If method is 'ping' or 'listMethods', use standard params
# Otherwise, pass input_text as a parameter
if [ "$METHOD" = "ping" ] || [ "$METHOD" = "listMethods" ]; then
  REQUEST_BODY=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "method": "${METHOD}",
  "id": ${REQUEST_ID}
}
EOF
)
else
  REQUEST_BODY=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "method": "${METHOD}",
  "params": {
    "text": "${INPUT_TEXT}"
  },
  "id": ${REQUEST_ID}
}
EOF
)
fi

# Make the request and capture response
echo "Calling MCP endpoint: ${MCP_ENDPOINT}" >&2
echo "Method: ${METHOD}" >&2
echo "Input: ${INPUT_TEXT}" >&2
echo "" >&2

RESPONSE=$(curl -s -X POST "${MCP_ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d "${REQUEST_BODY}")

# Check if response contains an error
ERROR=$(echo "${RESPONSE}" | grep -o '"error"[^}]*}' || true)

if [ -n "${ERROR}" ]; then
  echo "Error response:" >&2
  echo "${RESPONSE}" | jq '.' >&2
  exit 1
fi

# Extract and output result
# Try to extract text field first, then message, then output result as JSON
OUTPUT_TEXT=$(echo "${RESPONSE}" | jq -r '.result.text // .result.message // .result' 2>/dev/null || echo "")

if [ -z "${OUTPUT_TEXT}" ] || [ "${OUTPUT_TEXT}" = "null" ]; then
  echo "No result in response" >&2
  echo "${RESPONSE}" | jq '.' >&2
  exit 1
fi

# Output the text result
echo "${OUTPUT_TEXT}"