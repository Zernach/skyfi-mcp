#!/bin/bash

# Test script for HTTP + SSE communication
# Usage: ./test_sse.sh

BASE_URL="http://localhost:3000"
CLIENT_ID="test-client-$(date +%s)"

echo "Testing SkyFi MCP HTTP + SSE Communication"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Check server status
echo -e "${BLUE}Test 1: Check server status${NC}"
curl -s "${BASE_URL}/mcp/status" | jq .
echo ""

# Test 2: Establish SSE connection in background
echo -e "${BLUE}Test 2: Establish SSE connection${NC}"
echo "Opening SSE connection with client ID: ${CLIENT_ID}"
curl -N -s "${BASE_URL}/mcp/sse?clientId=${CLIENT_ID}" &
SSE_PID=$!
echo "SSE connection established (PID: ${SSE_PID})"
sleep 2
echo ""

# Test 3: Send message via HTTP POST (non-streaming)
echo -e "${BLUE}Test 3: Send non-streaming message${NC}"
curl -s -X POST "${BASE_URL}/mcp/message" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "ping",
    "params": {},
    "id": 1
  }' | jq .
echo ""

# Test 4: Send streaming message
echo -e "${BLUE}Test 4: Send streaming message${NC}"
echo "Sending message with streaming enabled..."
curl -s -X POST "${BASE_URL}/mcp/message" \
  -H "Content-Type: application/json" \
  -H "X-Client-ID: ${CLIENT_ID}" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"chat\",
    \"params\": {
      \"message\": \"What is SkyFi?\",
      \"clientId\": \"${CLIENT_ID}\",
      \"streaming\": true
    },
    \"id\": $(date +%s)
  }" | jq .
echo ""
echo "Check the SSE connection output above for streaming updates..."
sleep 5
echo ""

# Test 5: Check connection count
echo -e "${BLUE}Test 5: Check active connections${NC}"
curl -s "${BASE_URL}/mcp/status" | jq .
echo ""

# Cleanup
echo -e "${BLUE}Cleanup${NC}"
echo "Closing SSE connection..."
kill $SSE_PID 2>/dev/null
echo ""

echo -e "${GREEN}Tests complete!${NC}"
echo ""
echo "To manually test SSE connection:"
echo "  curl -N ${BASE_URL}/mcp/sse?clientId=my-test-client"
echo ""
echo "To send a streaming message:"
echo "  curl -X POST ${BASE_URL}/mcp/message \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -H 'X-Client-ID: my-test-client' \\"
echo "    -d '{\"jsonrpc\":\"2.0\",\"method\":\"chat\",\"params\":{\"message\":\"Hello\",\"clientId\":\"my-test-client\",\"streaming\":true},\"id\":1}'"


