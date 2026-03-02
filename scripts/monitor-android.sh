#!/bin/bash
# SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
#
# SPDX-License-Identifier: GPL-3.0-or-later

# Android Log Monitor for Increvise Mobile App
# Usage: ./scripts/monitor-android.sh [options]
# Options:
#   -c, --clear    Clear logcat before monitoring
#   -f, --filter   Custom filter pattern (default: "Mobile|SQLite|Capacitor/Console")
#   -h, --help     Show this help message

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
CLEAR_LOG=false
FILTER="Mobile|SQLite|Capacitor/Console"
SHOW_HELP=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -c|--clear)
      CLEAR_LOG=true
      shift
      ;;
    -f|--filter)
      FILTER="$2"
      shift 2
      ;;
    -h|--help)
      SHOW_HELP=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      SHOW_HELP=true
      shift
      ;;
  esac
done

# Show help
if [ "$SHOW_HELP" = true ]; then
  echo "Android Log Monitor for Increvise Mobile App"
  echo ""
  echo "Usage: ./scripts/monitor-android.sh [options]"
  echo ""
  echo "Options:"
  echo "  -c, --clear              Clear logcat before monitoring"
  echo "  -f, --filter PATTERN     Custom grep filter pattern"
  echo "                           (default: 'Mobile|SQLite|Capacitor/Console')"
  echo "  -h, --help               Show this help message"
  echo ""
  echo "Examples:"
  echo "  ./scripts/monitor-android.sh -c              # Clear and monitor"
  echo "  ./scripts/monitor-android.sh -f \"Error|Warn\" # Custom filter"
  exit 0
fi

# Check if adb is available
if ! command -v adb &> /dev/null; then
  echo -e "${RED}Error: adb not found. Please install Android SDK platform-tools.${NC}"
  exit 1
fi

# Check if device is connected
DEVICES=$(adb devices | grep -v "List of devices" | grep "device$" | wc -l)
if [ "$DEVICES" -eq 0 ]; then
  echo -e "${RED}Error: No Android device connected.${NC}"
  echo "Please connect a device and enable USB debugging."
  exit 1
fi

echo -e "${GREEN}✓ Found Android device${NC}"
echo -e "${BLUE}Package: com.increvise.app${NC}"
echo -e "${BLUE}Filter: ${FILTER}${NC}"
echo ""

# Clear logcat if requested
if [ "$CLEAR_LOG" = true ]; then
  echo -e "${YELLOW}Clearing logcat...${NC}"
  adb logcat -c
fi

# Start monitoring
echo -e "${GREEN}Starting log monitor... (Press Ctrl+C to stop)${NC}"
echo "-----------------------------------------------------------"

adb logcat | grep -E "$FILTER" --line-buffered --color=always
