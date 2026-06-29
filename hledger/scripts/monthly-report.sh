#!/usr/bin/env bash
# NOTE: Customize CONF_OPTS and file paths for your project
# Example: CONF_OPTS="--no-conf --file [YOUR_JOURNAL_FILE]"

# Generate a monthly financial report
# Usage: ./monthly-report.sh [YYYY-MM]

MONTH="${1:-$(date +%Y-%m)}"
# Default config file (can be overridden by setting CONF env var)
CONF_OPTS="--no-conf --file finance.journal"
MONTH_NUM="${MONTH##*-}"

# Determine next month for end date
NEXT_MONTH=$(date -d "$YEAR-$MONTH_NUM-01 +1 month" +%Y-%m-%d 2>/dev/null || date -v+1m -j -f "%Y-%m-%d" "$YEAR-$MONTH_NUM-01" "+%Y-%m-%d" 2>/dev/null || echo "$YEAR-$((10#$MONTH_NUM + 1))-01")

echo "═══════════════════════════════════════════"
echo "  Monthly Report: $MONTH"
echo "═══════════════════════════════════════════"

echo ""
echo "--- Income Statement ---"
hledger $CONF_OPTS incomestatement -b "$MONTH-01" -e "$NEXT_MONTH"

echo ""
echo "--- Balance Sheet ---"
hledger $CONF_OPTS balancesheet -e "$NEXT_MONTH"

echo ""
echo "--- Cash Flow ---"
hledger $CONF_OPTS cashflow -b "$MONTH-01" -e "$NEXT_MONTH"

echo ""
echo "--- Top Expenses ---"
hledger $CONF_OPTS balance expenses -b "$MONTH-01" -e "$NEXT_MONTH" --row-total --average --sort-amount

echo ""
echo "--- Expense Breakdown by Category ---"
hledger $CONF_OPTS balance expenses -b "$MONTH-01" -e "$NEXT_MONTH" --tree --depth 2

echo ""
echo "--- Revenue Sources ---"
hledger $CONF_OPTS balance revenues income -b "$MONTH-01" -e "$NEXT_MONTH" --tree --depth 2

echo ""
echo "--- Asset Changes ---"
hledger $CONF_OPTS balance assets -b "$MONTH-01" -e "$NEXT_MONTH" --change --tree --depth 2

echo ""
echo "--- Recent Transactions ---"
hledger $CONF_OPTS register -b "$MONTH-01" -e "$NEXT_MONTH"
