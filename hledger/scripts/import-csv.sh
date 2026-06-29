#!/usr/bin/env bash
# NOTE: Customize CONF_OPTS and file paths for your project
# Example: CONF_OPTS="--no-conf --file [YOUR_JOURNAL_FILE]"

# Import CSV from a bank using hledger rules
# Usage: ./import-csv.sh <csv-file> [<rules-file>]
# If rules-file is omitted, hledger will look for CSVFILE.rules in the same directory

CSV="$1"
CONF_OPTS="--no-conf --file finance.journal"
if [ -z "$CSV" ]; then
    echo "Usage: $0 <csv-file> [<rules-file>]"
    echo ""
    echo "Examples:"
    echo "  $0 ~/Downloads/[BANK_NAME].csv"
    echo "  $0 ~/Downloads/[BANK_NAME].csv rules/[BANK_NAME].rules"
    echo "  $0 ~/Downloads/[BROKER_NAME].csv rules/[BROKER_NAME].rules"
    echo ""
    echo "Available rules files:"
    ls -1 rules/*.rules 2>/dev/null || echo "  (none found in rules/ directory)"
    exit 1
fi

if [ ! -f "$CSV" ]; then
    echo "CSV file not found: $CSV"
    exit 1
fi

# Build the import command
if [ -n "$RULES" ]; then
    if [ ! -f "$RULES" ]; then
        echo "Rules file not found: $RULES"
        exit 1
    fi
    IMPORT_CMD="hledger --conf \"$CONF\" import \"$CSV\" --rules-file \"$RULES\""
else
    IMPORT_CMD="hledger --conf \"$CONF\" import \"$CSV\""
fi

echo "═══════════════════════════════════════════"
echo "  CSV Import Preview (dry-run)"
echo "═══════════════════════════════════════════"
echo ""
echo "CSV file:  $CSV"
[ -n "$RULES" ] && echo "Rules file: $RULES"
echo ""

# Dry run
$IMPORT_CMD --dry-run

DRYRUN_STATUS=$?

echo ""
if [ $DRYRUN_STATUS -ne 0 ]; then
    echo "ERROR: Dry-run failed with exit code $DRYRUN_STATUS"
    echo "Please check your CSV file and rules configuration."
    exit 1
fi

echo "═══════════════════════════════════════════"
echo "  Dry-run completed successfully"
echo "═══════════════════════════════════════════"
echo ""
echo "To import these transactions, run:"
[ -n "$RULES" ] && echo "  $IMPORT_CMD" || echo "  $IMPORT_CMD"
echo ""
read -p "Import now? [y/N] " CONFIRM

if [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ]; then
    echo ""
    echo "Importing..."
    $IMPORT_CMD
    echo ""
    echo "Import complete. Running validation..."
    hledger $CONF_OPTS check
else
    echo "Import cancelled."
fi
