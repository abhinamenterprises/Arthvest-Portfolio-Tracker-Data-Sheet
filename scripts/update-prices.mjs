import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTCnaPP3JRtfMn5ewXSCkR0ILjPX8H-AV3Z81bljOHBYy6GED0U1F42nKwcoVHrKL5r0Tb_UvzgIVTo/pub?gid=0&single=true&output=csv';
const LATEST_PATH = 'data/latest.json';
const HISTORY_PATH = 'data/history.json';
const HISTORY_DAYS = 400;

function parseCsv(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value.trim()); value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(value.trim());
      if (row.some(cell => cell !== '')) rows.push(row);
      row = []; value = '';
    } else value += char;
  }
  row.push(value.trim());
  if (row.some(cell => cell !== '')) rows.push(row);
  return rows;
}

function parsePrice(value) {
  const cleaned = String(value ?? '').replace(/INR|₹|,/gi, '').trim();
  const price = Number(cleaned);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function dateInIndia(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${part.year}-${part.month}-${part.day}`;
}

const response = await fetch(SHEET_CSV_URL, {
  headers: { 'user-agent': 'ArthvestPortfolioPriceFeed/1.0' },
  signal: AbortSignal.timeout(20000),
});
if (!response.ok) throw new Error(`Published sheet returned HTTP ${response.status}`);

const csv = (await response.text()).replace(/^\uFEFF/, '');
const prices = {};
for (const cells of parseCsv(csv)) {
  const symbol = String(cells[0] ?? '').trim().toUpperCase().replace(/^NSE:/, '');
  const price = parsePrice(cells[1]);
  if (!symbol || !price || /^(SYMBOL|STOCK|TICKER|COMPANY)$/i.test(symbol)) continue;
  prices[symbol] = price;
}
if (Object.keys(prices).length === 0) throw new Error('The published CSV contained no valid symbol and price rows.');

const fetchedAt = new Date().toISOString();
const asOfDate = dateInIndia();
const latest = {
  schemaVersion: 1,
  source: 'Google Sheets published CSV',
  fetchedAt,
  asOfDate,
  timezone: 'Asia/Kolkata',
  prices,
};

let snapshots = [];
if (existsSync(HISTORY_PATH)) {
  try {
    const old = JSON.parse(await readFile(HISTORY_PATH, 'utf8'));
    if (Array.isArray(old.snapshots)) snapshots = old.snapshots;
  } catch { /* A fresh history file will be created below. */ }
}
// Keep one end-of-day observation per India date. Intraday refreshes update
// today's row; the 17:00 IST workflow run leaves the final daily snapshot.
const currentSnapshot = { date: asOfDate, capturedAt: fetchedAt, prices };
const existingIndex = snapshots.findIndex(snapshot => snapshot.date === asOfDate);
if (existingIndex >= 0) snapshots[existingIndex] = currentSnapshot;
else snapshots.push(currentSnapshot);
const cutoff = new Date(`${asOfDate}T00:00:00+05:30`);
cutoff.setDate(cutoff.getDate() - HISTORY_DAYS);
const cutoffDate = dateInIndia(cutoff);
snapshots = snapshots.filter(snapshot => snapshot.date >= cutoffDate).sort((a, b) => a.date.localeCompare(b.date));

await writeFile(LATEST_PATH, `${JSON.stringify(latest, null, 2)}\n`);
await writeFile(HISTORY_PATH, `${JSON.stringify({ schemaVersion: 1, timezone: 'Asia/Kolkata', snapshots }, null, 2)}\n`);
console.log(`Updated ${Object.keys(prices).length} symbols for ${asOfDate} IST at ${fetchedAt}.`);

