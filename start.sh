#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="SkyFi MCP"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [[ "${OSTYPE:-}" != darwin* ]]; then
  echo -e "${RED}This launcher currently supports macOS Terminal only.${NC}"
  exit 1
fi

require_cli() {
  local cli_name="$1"
  if ! command -v "$cli_name" >/dev/null 2>&1; then
    echo -e "${RED}Missing required command: ${cli_name}.${NC}"
    exit 1
  fi
}

wait_for_backend() {
  local port="$1"
  local max_attempts=60
  local attempt=0
  
  echo -e "${YELLOW}Waiting for backend to be ready on port ${port}...${NC}"
  
  while [ $attempt -lt $max_attempts ]; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
      echo -e "${GREEN}Backend is ready!${NC}"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  
  echo -e "${RED}Backend did not become ready within ${max_attempts} seconds.${NC}"
  return 1
}

launch_terminal_tabs() {
  local title="$1"
  local backend_cmd="$2"
  local frontend_cmd="$3"
  local backend_port="$4"

  osascript - "$title" "$backend_cmd" "$frontend_cmd" "$backend_port" <<'APPLESCRIPT'
on run argv
  set projectTitle to item 1 of argv
  set backendCmd to item 2 of argv
  set frontendCmd to item 3 of argv
  set backendPort to item 4 of argv

  tell application "Terminal"
    -- Create new window with first tab for backend
    set newWindow to do script backendCmd
    activate
    try
      set custom title of front window to projectTitle
    end try
    try
      set custom title of tab 1 of front window to "Backend"
    end try
    
    -- Wait for backend dependencies and startup
    delay 10
    
    -- Create second tab and run frontend command
    tell application "System Events"
      tell process "Terminal"
        keystroke "t" using {command down}
      end tell
    end tell
    delay 0.5
    
    tell front window
      do script frontendCmd in selected tab
      try
        set custom title of tab 2 of front window to "Frontend"
      end try
    end tell
  end tell
end run
APPLESCRIPT

  # Wait for backend to be ready
  wait_for_backend "$backend_port"
}

require_cli "osascript"
require_cli "node"
require_cli "npm"

# Check if Docker is running (required for PostgreSQL and Redis)
if ! docker info >/dev/null 2>&1; then
  echo -e "${RED}Docker is not running. Please start Docker Desktop.${NC}"
  exit 1
fi

# Check if PostgreSQL is available
if ! lsof -Pi :5432 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo -e "${YELLOW}PostgreSQL doesn't appear to be running on port 5432.${NC}"
  echo -e "${YELLOW}Starting Docker Compose services (PostgreSQL & Redis)...${NC}"
  cd "$SCRIPT_DIR/backend" && docker-compose up -d postgres redis
  echo -e "${GREEN}Waiting for PostgreSQL and Redis to be ready...${NC}"
  sleep 5
fi

# Check if Redis is running
if ! lsof -Pi :6379 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo -e "${YELLOW}Redis doesn't appear to be running on port 6379.${NC}"
  echo -e "${YELLOW}Starting Redis via Docker Compose...${NC}"
  cd "$SCRIPT_DIR/backend" && docker-compose up -d redis
  sleep 3
fi

BACKEND_CMD="cd \"$SCRIPT_DIR/backend\" && printf 'Installing backend dependencies if needed...\\n' && npm install --silent && printf 'Starting Node.js/TypeScript backend...\\n' && npm run dev"
FRONTEND_CMD="cd \"$SCRIPT_DIR/frontend\" && printf 'Installing frontend dependencies if needed...\\n' && npm install --silent && printf 'Starting React frontend...\\n' && npm start"

echo -e "${BLUE}Starting ${PROJECT_NAME} services...${NC}"
launch_terminal_tabs "$PROJECT_NAME" "$BACKEND_CMD" "$FRONTEND_CMD" "3000"

echo -e "${GREEN}All services are launching in a single Terminal window with two tabs.${NC}"
echo -e "${YELLOW}Backend API: http://localhost:3000${NC}"
echo -e "${YELLOW}Backend Health: http://localhost:3000/health${NC}"
echo -e "${YELLOW}Backend MCP: http://localhost:3000/mcp/sse${NC}"
echo -e "${YELLOW}Frontend: http://localhost:3000 (or check the Frontend tab for the actual port)${NC}"
echo -e "${YELLOW}PostgreSQL: localhost:5432${NC}"
echo -e "${YELLOW}Redis: localhost:6379${NC}"

