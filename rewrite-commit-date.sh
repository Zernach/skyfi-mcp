#!/bin/bash

# Script to rewrite the newest commit date to match the second newest commit date
# Usage: ./rewrite-commit-date.sh [--push]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the newest commit hash
NEWEST_COMMIT=$(git rev-parse HEAD)
echo -e "${GREEN}Newest commit:${NC} $NEWEST_COMMIT"

# Get the second newest commit hash
SECOND_NEWEST_COMMIT=$(git rev-parse HEAD~1)
echo -e "${GREEN}Second newest commit:${NC} $SECOND_NEWEST_COMMIT"

# Get the date from the second newest commit
TARGET_DATE=$(git show -s --format=%ci "$SECOND_NEWEST_COMMIT")
echo -e "${GREEN}Target date:${NC} $TARGET_DATE"

# Show current dates of newest commit
echo -e "\n${YELLOW}Current dates of newest commit:${NC}"
git show -s --format="  Author date:   %ai%n  Committer date: %ci" "$NEWEST_COMMIT"

# Confirm before proceeding
echo -e "\n${YELLOW}This will amend the newest commit with the date from the second newest commit.${NC}"
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Aborted.${NC}"
    exit 1
fi

# Amend the commit with both author and committer dates
# Set both environment variables to ensure both dates are updated
echo -e "\n${GREEN}Amending commit...${NC}"
export GIT_AUTHOR_DATE="$TARGET_DATE"
export GIT_COMMITTER_DATE="$TARGET_DATE"
git commit --amend --no-edit

# Show new dates
echo -e "\n${GREEN}New dates after amendment:${NC}"
git show -s --format="  Author date:   %ai%n  Committer date: %ci" HEAD

# Check if --push flag was provided
if [[ "$1" == "--push" ]]; then
    echo -e "\n${YELLOW}Force pushing to origin/main...${NC}"
    echo -e "${RED}WARNING: This will rewrite history on the remote!${NC}"
    read -p "Continue with force push? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git push --force-with-lease origin main
        echo -e "${GREEN}Force push completed.${NC}"
    else
        echo -e "${YELLOW}Force push skipped. Run 'git push --force-with-lease origin main' manually when ready.${NC}"
    fi
else
    echo -e "\n${YELLOW}To push these changes, run:${NC}"
    echo "  git push --force-with-lease origin main"
    echo -e "\n${YELLOW}Or run this script with --push flag:${NC}"
    echo "  ./rewrite-commit-date.sh --push"
fi

echo -e "\n${GREEN}Done!${NC}"
