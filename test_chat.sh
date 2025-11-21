#!/bin/bash

# Test script for the tool-calling chat system
# Usage: ./test_chat.sh "Your message here" [conversationId]

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
# API_URL="${API_URL:-http://skyfi-mcp-prod-v2-alb-680967047.us-east-1.elb.amazonaws.com}"
ENDPOINT="/mcp/message"

# Get message from command line argument
MESSAGE="$1"
CONVERSATION_ID="${2:-}"

if [ -z "$MESSAGE" ]; then
    echo -e "${RED}Usage: $0 \"Your message here\" [conversationId]${NC}"
    echo ""
    echo "Examples:"
    echo "  $0 \"Find satellite images of Paris\""
    echo "  $0 \"Show me more details\" conv_abc123"
    echo ""
    exit 1
fi

# Build JSON payload
if [ -n "$CONVERSATION_ID" ]; then
    PAYLOAD=$(jq -n \
        --arg msg "$MESSAGE" \
        --arg conv "$CONVERSATION_ID" \
        '{
            jsonrpc: "2.0",
            method: "chat",
            params: {
                message: $msg,
                conversationId: $conv
            },
            id: 1
        }')
else
    PAYLOAD=$(jq -n \
        --arg msg "$MESSAGE" \
        '{
            jsonrpc: "2.0",
            method: "chat",
            params: {
                message: $msg
            },
            id: 1
        }')
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}  ${YELLOW}SkyFi MCP Tool-Calling Chat Test${NC}                          ${BLUE}║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}→ Message:${NC} $MESSAGE"
if [ -n "$CONVERSATION_ID" ]; then
    echo -e "${GREEN}→ Conversation ID:${NC} $CONVERSATION_ID"
fi
echo -e "${GREEN}→ Endpoint:${NC} $API_URL$ENDPOINT"
echo ""
echo -e "${YELLOW}⏳ Sending request...${NC}"
echo ""

# Send request and capture response
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

# Check if curl succeeded
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to connect to server${NC}"
    echo "  Make sure the server is running: npm start"
    exit 1
fi

# Extract HTTP status code (last line)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

# Check HTTP status code
if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}✗ HTTP Error ${HTTP_CODE}${NC}"
    echo ""
    echo "Response body:"
    echo "$RESPONSE_BODY"
    exit 1
fi

# Check if response is valid JSON
if ! echo "$RESPONSE_BODY" | jq . >/dev/null 2>&1; then
    echo -e "${RED}✗ Invalid JSON response${NC}"
    echo ""
    echo "Raw response:"
    echo "$RESPONSE_BODY"
    exit 1
fi

# Parse response
ERROR=$(echo "$RESPONSE_BODY" | jq -r '.error // empty')

if [ -n "$ERROR" ]; then
    # Error response
    ERROR_CODE=$(echo "$RESPONSE_BODY" | jq -r '.error.code')
    ERROR_MSG=$(echo "$RESPONSE_BODY" | jq -r '.error.message')
    
    echo -e "${RED}✗ Error ${ERROR_CODE}:${NC} $ERROR_MSG"
    echo ""
    echo "Full response:"
    echo "$RESPONSE_BODY" | jq '.'
    exit 1
else
    # Success response
    RESULT=$(echo "$RESPONSE_BODY" | jq -r '.result')
    RESPONSE_TEXT=$(echo "$RESULT" | jq -r '.response')
    CONV_ID=$(echo "$RESULT" | jq -r '.conversationId')
    TOOLS_USED=$(echo "$RESULT" | jq -r '.toolsUsed | join(", ")')
    MODEL=$(echo "$RESULT" | jq -r '.metadata.model')
    EXEC_TIME=$(echo "$RESULT" | jq -r '.metadata.executionTime')
    TOOL_COUNT=$(echo "$RESULT" | jq -r '.metadata.toolCallCount')
    
    echo -e "${GREEN}✓ Response received${NC}"
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}  ${YELLOW}Assistant Response${NC}                                          ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Word-wrap the response text
    echo "$RESPONSE_TEXT" | fold -s -w 64
    
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}  ${YELLOW}Metadata${NC}                                                    ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}→ Conversation ID:${NC} $CONV_ID"
    echo -e "${GREEN}→ Model:${NC} $MODEL"
    echo -e "${GREEN}→ Execution Time:${NC} ${EXEC_TIME}ms"
    echo -e "${GREEN}→ Tools Used:${NC} $TOOLS_USED"
    echo -e "${GREEN}→ Tool Call Count:${NC} $TOOL_COUNT"
    echo ""
    
    # Show how to continue the conversation
    if [ -z "$CONVERSATION_ID" ]; then
        echo -e "${YELLOW}💡 To continue this conversation, use:${NC}"
        echo -e "   $0 \"Your follow-up message\" $CONV_ID"
        echo ""
    fi
fi

# Show full JSON for debugging (optional)
if [ "$DEBUG" = "1" ]; then
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}  ${YELLOW}Full JSON Response${NC}                                          ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "$RESPONSE_BODY" | jq '.'
    echo ""
fi

exit 0

