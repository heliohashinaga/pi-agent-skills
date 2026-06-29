#!/bin/bash
# Detect optimal orchestration tier for this machine

TOTAL_RAM_GB=$(free -g | awk '/^Mem:/ {print $2}')
AVAILABLE_RAM_GB=$(free -g | awk '/^Mem:/ {print $7}')
CORES=$(nproc)
VS_CODE_PID=$(pgrep -f "code-server|Roslyn" | wc -l)

echo "=== System Profile ==="
echo "Total RAM: ${TOTAL_RAM_GB} GB"
echo "Available RAM: ${AVAILABLE_RAM_GB} GB"
echo "CPU Cores: ${CORES}"
echo "VS Code processes: ${VS_CODE_PID}"
echo ""

if [ "$TOTAL_RAM_GB" -lt 4 ] || [ "$AVAILABLE_RAM_GB" -lt 2 ]; then
    echo "ORCHESTRATION_TIER=single"
    echo "MAX_WORKERS=1"
    echo "BUILD_FLAGS=--no-parallel"
    echo "Tier: ⚠️  SINGLE (Sequential) — Limited resources"
elif [ "$TOTAL_RAM_GB" -ge 4 ] && [ "$TOTAL_RAM_GB" -lt 8 ]; then
    echo "ORCHESTRATION_TIER=semi"
    echo "MAX_WORKERS=2"
    echo "BUILD_FLAGS=--no-parallel"
    echo "Tier: ⚡ SEMI-PARALLEL — Balanced execution"
else
    echo "ORCHESTRATION_TIER=full"
    echo "MAX_WORKERS=$((CORES - 1))"
    echo "BUILD_FLAGS="
    echo "Tier: 🚀 FULL-PARALLEL — Unlimited resources"
fi
