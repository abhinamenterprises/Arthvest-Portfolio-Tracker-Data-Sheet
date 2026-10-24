# Arthvest Portfolio Tracker price feed

This repository keeps a public feed of current and daily historical prices used by the Arthvest portfolio tracker. A scheduled JavaScript workflow reads the published Google Sheet (symbols in column A and prices in column B), writes a small JSON file for the dashboard, and records daily snapshots for historical performance calculations.

## Files

- `data/latest.json` contains the latest prices and their fetch timestamp.
- `data/history.json` contains one price snapshot per India calendar date, retained for 400 days.
- `scripts/update-prices.mjs` reads the published CSV and updates both data files.
- `.github/workflows/update-prices.yml` schedules the refresh and allows a manual run from GitHub Actions.

The tracker can combine these dated stock prices with each user's own transactions and capital movements to calculate portfolio performance over 1 week, 1 month, 3 months, 6 months, and 1 year. This feed contains market prices only; it must never contain a user's holdings, transactions, login details, or other private information.

## Refresh schedule

GitHub Actions refreshes the feed about every 15 minutes on weekdays during Indian market hours and makes an additional refresh around 5:00 p.m. India time. Scheduled runs can start late, and the sheet's Google Finance prices may themselves be delayed. Check `fetchedAt` and `asOfDate` in `data/latest.json` before treating a quote as current.

To run the refresh manually, open **Actions → Update market prices → Run workflow**. The workflow needs repository Actions enabled and the default `GITHUB_TOKEN` permitted to write repository contents. No personal access token or paid market-data API key is used.

## Price data notes

The Google Sheet must remain published as CSV and keep the symbol in column A and a positive numeric price in column B. Header rows are ignored. Symbols can include an `NSE:` prefix. Rows without a valid symbol and price are skipped. If the sheet cannot be fetched or has no valid rows, the workflow fails without replacing the last good feed.

Market quotes may be delayed or incomplete. This feed is for portfolio tracking and educational use, not for placing trades or financial advice.

