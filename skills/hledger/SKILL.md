---
name: hledger
description: hledger accounting commands for managing personal and small business finances. Use for running reports (balance, register, incomestatement, cashflow, balancesheet), importing CSV bank transactions with rules, adding/editing journal entries, checking/validating the ledger, and any hledger CLI operations. Requires an hledger.conf configuration; do NOT set --file inside the config to avoid accidental double-reading.
---

# hledger Skill

This skill wraps hledger commands for hledger accounting projects, based on hledger 1.40+.

## Project Structure

```
## Project Structure

```
your-project/
├── [MAIN_JOURNAL].journal       # Main journal (entry point, includes sub-journals)
├── hledger.conf                 # hledger configuration file
├── journal/
│   ├── [YEAR].journal           # Transactions for the current year
│   └── opening-balances.journal # Opening balances
├── prices/
│   └── prices.journal           # Commodity prices (optional)
└── rules/
    ├── [BANK_NAME].rules        # Bank CSV import rules (optional)
    ├── [BANK_NAME].rules        # Another bank CSV import rules
    └── [BROKER_NAME].rules      # Broker CSV import rules (optional)
```

> **Note**: Your project structure may differ. Customize paths and names as needed.

## Config File Usage

**⚠️ CRITICAL: Avoid Double-Read Errors**

Do NOT place `--file` inside `hledger.conf`. If both are present and conflicting, hledger reads your journal file **TWICE**, causing all account balances to duplicate.

```bash
# ❌ BAD - Causes duplicate reads
# hledger.conf contains: --file [JOURNAL_FILE]
hledger --no-conf --file [JOURNAL_FILE] balance
# Result: [JOURNAL_FILE] read TWICE → all values doubled!

# ✅ GOOD - hledger.conf with display options only
# hledger.conf contains: --pretty-tables, --width 100, etc. (NO --file)
hledger --no-conf --file [JOURNAL_FILE] balance
# Result: [JOURNAL_FILE] read ONCE → correct values

# ✅ GOOD - No config, explicit file
hledger --no-conf --file [JOURNAL_FILE] balance
# Result: [JOURNAL_FILE] read ONCE → correct values
```

**Recommended hledger.conf structure**:
```conf
# hledger.conf - Display and behavior options ONLY
# NOTE: Do NOT include --file here!

--pretty-tables           # Better table formatting
--decimal-mark .          # Decimal separator
--commodity-style "$1,000.00"  # Currency display
--width 100              # Output width in characters
```

Then use:
```bash
hledger --no-conf --file [JOURNAL_FILE] <command>
```

**For automation scripts**, use the safest approach:
```bash
hledger --no-conf --file [JOURNAL_FILE] <command>
```
This avoids config file side effects completely.

If a command behaves unexpectedly, try with `-n` (`--no-conf`) to rule out config effects:
```bash
hledger --no-conf --file [JOURNAL_FILE] <cmd>
```

## Common Commands

### Reports

```bash
# Balance sheet (assets, liabilities, net worth)
hledger --no-conf --file [JOURNAL_FILE] balancesheet

# Balance sheet with equity
hledger --no-conf --file [JOURNAL_FILE] balancesheetequity

# Income statement (revenues and expenses)
hledger --no-conf --file [JOURNAL_FILE] incomestatement

# Cash flow (liquid assets)
hledger --no-conf --file [JOURNAL_FILE] cashflow

# General balance report (most flexible)
hledger --no-conf --file [JOURNAL_FILE] balance

# Account register for a specific account
hledger --no-conf --file [JOURNAL_FILE] register assets:bank

# Transaction-oriented register (one line per transaction)
hledger --no-conf --file [JOURNAL_FILE] aregister checking

# Monthly expense breakdown
hledger --no-conf --file [JOURNAL_FILE] balance --monthly expenses

# Weekly balance changes
hledger --no-conf --file [JOURNAL_FILE] balance --weekly assets

# Quarterly income statement
hledger --no-conf --file [JOURNAL_FILE] incomestatement --quarterly
```

### Data Integrity & Validation

```bash
# Run all default checks (parseable, autobalanced, assertions)
hledger --no-conf --file [JOURNAL_FILE] check

# Run with strict mode (also checks accounts, commodities, balanced)
hledger --no-conf --file [JOURNAL_FILE] check -s

# Check ordered dates within each file
hledger --no-conf --file [JOURNAL_FILE] check ordereddates

# Check recent assertions (all asserted accounts must have assertion within 7 days of latest posting)
hledger --no-conf --file [JOURNAL_FILE] check recentassertions

# Check unique leaf names (no two accounts share the same last part)
hledger --no-conf --file [JOURNAL_FILE] check uniqueleafnames

# Check payees (all payees must be declared)
hledger --no-conf --file [JOURNAL_FILE] check payees

# Check tags (all tags must be declared)
hledger --no-conf --file [JOURNAL_FILE] check tags

# Check specific types
hledger --no-conf --file [JOURNAL_FILE] check accounts commodities
```

### Query & Discovery

```bash
# List all accounts
hledger --no-conf --file [JOURNAL_FILE] accounts

# List accounts as tree
hledger --no-conf --file [JOURNAL_FILE] accounts --tree

# List with types
hledger --no-conf --file [JOURNAL_FILE] accounts --types

# List payees
hledger --no-conf --file [JOURNAL_FILE] payees

# List commodities
hledger --no-conf --file [JOURNAL_FILE] commodities

# List tags
hledger --no-conf --file [JOURNAL_FILE] tags

# List descriptions
hledger --no-conf --file [JOURNAL_FILE] descriptions

# Show transactions matching a query
hledger --no-conf --file [JOURNAL_FILE] print desc:"Supermarket"

# Show recent transactions
hledger --no-conf --file [JOURNAL_FILE] print --tail 10

# Show cleared transactions only
hledger --no-conf --file [JOURNAL_FILE] print --cleared

# Show stats
hledger --no-conf --file [JOURNAL_FILE] stats
```

### Import (CSV → Journal)

hledger's `import` command detects new transactions in CSV files and appends them to the main journal. It avoids duplicates by tracking the latest date seen in a hidden `.latest.FILE.csv` file.

**Naming convention:** For `bank.csv`, hledger looks for `bank.csv.rules` in the same directory. You can also specify a rules file with `--rules-file`.

```bash
# Preview what would be imported (always do this first!)
hledger --no-conf --file [JOURNAL_FILE] import [BANK_NAME].csv --dry-run

# Import with explicit rules file (when rules are in rules/ dir)
hledger --no-conf --file [JOURNAL_FILE] import --rules-file rules/[BANK_NAME].rules [BANK_NAME].csv --dry-run

# Import multiple CSVs
hledger --no-conf --file [JOURNAL_FILE] import *.csv --dry-run

# After verifying, run without --dry-run to actually import
hledger --no-conf --file [JOURNAL_FILE] import [BANK_NAME].csv

# Mark all current records as already imported (creates/updates .latest file)
hledger --no-conf --file [JOURNAL_FILE] import [BANK_NAME].csv --catchup
```

You can also read CSV directly:
```bash
# Preview CSV as journal entries
hledger --no-conf --file [JOURNAL_FILE] -f [BANK_NAME].csv print

# Balance from CSV
hledger --no-conf --file [JOURNAL_FILE] -f [BANK_NAME].csv balance
```

### Adding Transactions

When the user wants to add a transaction, append it to `journal/[YEAR].journal` (or the appropriate year file).

#### Using Tags
Tags are a powerful way to annotate transactions and postings with additional contextual information, such as categories, projects, or contexts.

To add a tag to a transaction or posting, use the syntax:
```journal
2026-06-01 * Purchase
    expenses:food               [AMOUNT] [CURRENCY]    ; tag:groceries
    assets:bank:[BANK_NAME]                     ; tag:budget:monthly
```
- Tags are defined after a semicolon (`;`).
- Use a colon (`:`) to separate the tag key and value, e.g., `tag:key:value`.
- To filter reports with tags, use queries like `tag:key:value` or `tag:key`.
- Tags are particularly useful for categorization or identifying project-specific transactions.

Format:
```journal
YYYY-MM-DD [STATUS] [(CODE)] DESCRIPTION
    ACCOUNT       AMOUNT COMMODITY
    ACCOUNT
```

- **STATUS**: Transaction status marks are optional and useful:
  - **`*` (Cleared)**: Indicates the transaction is confirmed and verified.
  - **`!` (Pending)**: Marks the transaction as tentatively cleared but not yet fully confirmed (e.g., not reflected in a bank statement).
- **CODE**: optional transaction ID in parentheses, e.g. `(12345)`
- **DESCRIPTION**: can include `PAYEE | NOTE` separated by pipe
- At least two spaces between account name and amount
- One posting can omit the amount (it's inferred to balance the transaction)

Example:
```journal
2026-05-14 * Supermarket X
    expenses:food:groceries          [AMOUNT] [CURRENCY]
    assets:bank:[BANK_NAME]

2026-05-14 ! Monthly rent
    expenses:home:rent             [AMOUNT] [CURRENCY]
    assets:bank:[BANK_NAME]

2026-05-15 (INV-001) Freelance payment
    assets:bank:[BANK_NAME]               [AMOUNT] [CURRENCY]
    income:freelance
```

After adding transactions, always validate:
```bash
hledger --no-conf --file [JOURNAL_FILE] check
```

### Balance Assertions

Add assertions to validate account balances:
```journal
2026-05-15 * Reconcile checking
    assets:bank:[BANK_NAME]           = [AMOUNT] [CURRENCY]
    equity:reconciliation
```

Types of assertions:
- `= BALANCE` — single commodity, excludes subaccounts
- `=* BALANCE` — single commodity, includes subaccounts
- `== BALANCE` — multi-commodity, excludes subaccounts
- `==* BALANCE` — multi-commodity, includes subaccounts

### Valuation & Cost Reporting

```bash
# Show amounts at cost (using costs recorded in transactions)
hledger --no-conf --file [JOURNAL_FILE] balance -B

# Show market value at period end (-V is shorthand for --value=end)
hledger --no-conf --file [JOURNAL_FILE] balancesheet -V

# Convert to a specific commodity
hledger --no-conf --file [JOURNAL_FILE] balance -X BRL

# Show value on transaction dates
hledger --no-conf --file [JOURNAL_FILE] balance --value=then

# Show current market value
hledger --no-conf --file [JOURNAL_FILE] balance --value=now

# Show value on a specific date
hledger --no-conf --file [JOURNAL_FILE] balance --value=2026-05-01

# Infer market prices from transaction costs
hledger --no-conf --file [JOURNAL_FILE] balancesheet -V --infer-market-prices
```

### Prices

```bash
# Show declared market prices
hledger --no-conf --file [JOURNAL_FILE] prices

# Show with inferred prices from costs
hledger --no-conf --file [JOURNAL_FILE] prices --infer-market-prices

# Show reverse-inferred prices
hledger --no-conf --file [JOURNAL_FILE] prices --show-reverse
```

## Filtering & Queries

Most commands accept [QUERY] arguments to filter data:

```bash
# By account name (regex, case insensitive)
hledger --no-conf --file [JOURNAL_FILE] balance expenses:food

# By description
hledger --no-conf --file [JOURNAL_FILE] print desc:amazon

# By payee (left of | in description)
hledger --no-conf --file [JOURNAL_FILE] print payee:"Gas Station"

# By date range
hledger --no-conf --file [JOURNAL_FILE] register -b 2026-01-01 -e 2026-04-01
hledger --no-conf --file [JOURNAL_FILE] balance date:2026-01-01..2026-03-31

# By period expression
hledger --no-conf --file [JOURNAL_FILE] incomestatement -p "this month"
hledger --no-conf --file [JOURNAL_FILE] balance -p "monthly in 2026"

# By status
hledger --no-conf --file [JOURNAL_FILE] balance status:*       # cleared only
hledger --no-conf --file [JOURNAL_FILE] balance status:!       # pending only

# By commodity
hledger --no-conf --file [JOURNAL_FILE] balance cur:BRL
hledger --no-conf --file [JOURNAL_FILE] balance cur:\$          # for $

# By tag
hledger --no-conf --file [JOURNAL_FILE] balance tag:trip
hledger --no-conf --file [JOURNAL_FILE] balance tag:trip=paris

# Exclude with not:
hledger --no-conf --file [JOURNAL_FILE] balance not:equity

# Boolean queries
hledger --no-conf --file [JOURNAL_FILE] print expr:'expenses AND (food OR rent)'

# Depth limit
hledger --no-conf --file [JOURNAL_FILE] balance --depth 2
hledger --no-conf --file [JOURNAL_FILE] balance -2              # shorthand

# Real postings only (exclude virtual)
hledger --no-conf --file [JOURNAL_FILE] balance --real
```

## Output Formats

Many commands support different output formats:

```bash
# CSV output
hledger --no-conf --file [JOURNAL_FILE] print -O csv

# JSON output
hledger --no-conf --file [JOURNAL_FILE] balance -O json

# HTML output
hledger --no-conf --file [JOURNAL_FILE] balancesheet -o report.html

# Write to file (format inferred from extension)
hledger --no-conf --file [JOURNAL_FILE] balance -o balances.csv
```

Supported output formats vary by command: txt, csv, tsv, json, html, fods, beancount, sql.

## Scripts

Helper scripts in the `scripts/` directory:

```bash
# Generate monthly report (income statement, balance sheet, cash flow, top expenses)
./scripts/monthly-report.sh [YYYY-MM]

# Import CSV with automatic dry-run preview, then manual confirm
./scripts/import-csv.sh <csv-file> [<rules-file>]

# Run all validation checks
./scripts/validate.sh
```

## Troubleshooting

### "Account balances are doubled or duplicated"

**Problem**: `hledger balance` shows values that are 2x what they should be, or duplicate account entries

**Root Cause**: `--file` is defined in both `hledger.conf` AND passed on the command line. hledger reads the journal file **TWICE**, doubling all balances.

**Solution**:
1. Check your `hledger.conf` - it should NOT contain `--file`:
   ```bash
   grep "--file" hledger.conf
   # If this returns anything, edit hledger.conf and remove the --file line
   ```

2. Remove `--file` from hledger.conf:
   ```conf
   # hledger.conf - GOOD (display options only)
   --pretty-tables
   --decimal-mark .
   --commodity-style "$1,000.00"
   --width 100
   # NO --file HERE!
   ```

3. Always specify file on command line:
   ```bash
   # Use one of these approaches:
   hledger --conf hledger.conf --file [JOURNAL_FILE] balance
   # OR
   hledger --no-conf --file [JOURNAL_FILE] balance
   ```

4. Verify fix:
   ```bash
   hledger --no-conf --file [JOURNAL_FILE] balance assets:realestate
   # Should show single value, not doubled
   ```

**Prevention**: Always use `--no-conf --file` in scripts to avoid config conflicts:
```bash
#!/bin/bash
hledger --no-conf --file [JOURNAL_FILE] check  # Safe for automation
```

---

### "Import doesn't find my CSV"

- **Always use `--dry-run` first** when importing CSV to preview transactions
- **Validate after changes** with `hledger --no-conf --file [JOURNAL_FILE] check`
- **Use `-n`/`--no-conf`** in scripts to avoid config file side effects
- **Use `--pretty`** for better table formatting (can be added to hledger.conf)
- **Use `--depth N`** to get summaries without too much detail
- **Sort by amount** with `-S`/`--sort-amount` (in flat mode)
- **Show empty/zero accounts** with `-E`/`--empty`
- **Exclude virtual postings** with `-R`/`--real`
- **hledger accepts unambiguous prefixes** for flags: `--dry` for `--dry-run`, `-M` for `--monthly`, etc.

- The pipe character `|` in descriptions separates payee from note: `PAYEE | NOTE`
- Two or more spaces are required between account name and amount in postings


**Problem**: `hledger import bank.csv` says file not found

**Solution**:
1. Check file exists: `ls -la bank.csv`
2. Check working directory: `pwd`
3. Use full path: `hledger --no-conf --file [JOURNAL_FILE] import /path/to/bank.csv --dry-run`
4. Check hledger.conf is using the right directory

---

### "Commands are slow or hanging"

**Problem**: `hledger balance` takes forever or seems frozen

**Possible causes**:
- Large journal file (1000+ transactions)
- Recursive account lookups
- Price market value calculations

**Solution**:
1. Try with `--depth 2` to limit output
2. Use `-E` to exclude empty accounts
3. Run with `--no-conf` to skip any heavy config
4. Check if you have circular account references

---

## Tips & Best Practices

- **Always use `--dry-run` first** when importing CSV to preview transactions
- **Validate after changes** with `hledger --no-conf --file [JOURNAL_FILE] check`
- **Use `--no-conf --file` in scripts** to avoid config file side effects and double-read errors
- **Use `-n`/`--no-conf`** when troubleshooting to isolate config issues
- **Use `--pretty`** for better table formatting (can be added to hledger.conf)
- **Use `--depth N`** to get summaries without too much detail
- **Sort by amount** with `-S`/`--sort-amount` (in flat mode)
- **Show empty/zero accounts** with `-E`/`--empty`
- **Exclude virtual postings** with `-R`/`--real`
- **hledger accepts unambiguous prefixes** for flags: `--dry` for `--dry-run`, `-M` for `--monthly`, etc.
- **Never put `--file` in hledger.conf** if you also pass it on the command line (causes double-read errors)

- The pipe character `|` in descriptions separates payee from note: `PAYEE | NOTE`
- Two or more spaces are required between account name and amount in postings
