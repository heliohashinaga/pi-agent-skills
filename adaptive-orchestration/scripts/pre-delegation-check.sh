#!/bin/bash
# Validate system state before delegating tasks

set -e

echo "=== Pre-Delegation Health Check ==="
echo ""

# 1. Memory state
AVAILABLE=$(free -g | awk '/^Mem:/ {print $7}')
if [ "$AVAILABLE" -lt 2 ]; then
    echo "❌ FAIL: Only ${AVAILABLE}GB available (need 2GB minimum)"
    echo "   ACTION: Run 'dotnet clean' or close VS Code"
    exit 1
fi
echo "✅ Memory: ${AVAILABLE}GB available"

# 2. Swap state
SWAP_USED=$(free -g | awk '/^Swap:/ {print $3}')
SWAP_TOTAL=$(free -g | awk '/^Swap:/ {print $2}')
SWAP_PERC=$((SWAP_USED * 100 / SWAP_TOTAL))
if [ "$SWAP_PERC" -gt 50 ]; then
    echo "⚠️  WARNING: Swap ${SWAP_USED}GB/${SWAP_TOTAL}GB (${SWAP_PERC}%)"
fi
echo "✅ Swap: ${SWAP_USED}GB/${SWAP_TOTAL}GB (${SWAP_PERC}%)"

# 3. VS Code state
VS_PIDS=$(pgrep -f "Roslyn|csdevkit" 2>/dev/null | wc -l || echo "0")
if [ "$VS_PIDS" -gt 3 ]; then
    echo "⚠️  WARNING: ${VS_PIDS} VS Code .NET processes active"
    echo "   RECOMMENDATION: Close VS Code or mute Roslyn for builds"
fi
echo "✅ VS Code processes: ${VS_PIDS}"

# 4. Disk space
DISK_FREE_KB=$(df /home/helio 2>/dev/null | awk 'NR==2 {print $4}' || echo "0")
DISK_FREE_GB=$((DISK_FREE_KB / 1024 / 1024))
if [ "$DISK_FREE_GB" -lt 5 ]; then
    echo "❌ FAIL: Only ${DISK_FREE_GB}GB disk free (need 5GB+)"
    exit 1
fi
echo "✅ Disk: ${DISK_FREE_GB}GB available"

# 5. Clean state
if [ -d "bin" ] || [ -d "obj" ]; then
    echo "⚠️  WARNING: bin/ or obj/ directories present (~200MB)"
    echo "   RECOMMENDATION: Run 'dotnet clean' to free space"
fi
echo "✅ Build artifacts: Clean"

# 6. Git state
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo "❌ FAIL: Working tree has uncommitted changes"
    exit 1
fi
echo "✅ Git: Clean working tree"

echo ""
echo "✅ All checks passed — Ready for delegation!"
