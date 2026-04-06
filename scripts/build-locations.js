#!/usr/bin/env node
/**
 * Build public/data/locations.json
 *
 * Sources:
 *   - Suriname populated places  → Wikipedia "Populated places in Suriname" category (free, no key)
 *   - Country list               → restcountries.com (free, no key)
 *
 * Run once (or whenever you want fresh data):
 *   node scripts/build-locations.js
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'GuestTracker/1.0 (guest-tracker)' } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(new Error(`JSON parse failed for ${url}: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

async function fetchSurinamePlaces() {
  // Wikipedia category API — pages in "Populated places in Suriname"
  // Paginates with cmcontinue until all results are fetched
  const base = 'https://en.wikipedia.org/w/api.php?action=query&list=categorymembers'
    + '&cmtitle=Category:Populated_places_in_Suriname'
    + '&format=json&cmlimit=500&cmtype=page';

  console.log('Fetching Suriname places from Wikipedia…');

  let places = [];
  let continueParam = '';

  do {
    const url  = continueParam ? `${base}&cmcontinue=${continueParam}` : base;
    const data = await get(url);

    const titles = (data.query?.categorymembers || []).map(m => m.title);
    places.push(...titles);

    continueParam = data.continue?.cmcontinue || '';
  } while (continueParam);

  // Strip disambiguation suffixes like "Paramaribo (city)"
  const cleaned = [
    ...new Set(
      places
        .map(t => t.replace(/\s*\(.*?\)\s*$/, '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'nl'))
    ),
  ];

  console.log(`  → ${cleaned.length} Suriname places`);
  return cleaned;
}

async function fetchCountries() {
  console.log('Fetching country list from restcountries.com…');
  const data = await get('https://restcountries.com/v3.1/all?fields=name');

  const countries = data
    .map(c => c.name.common)
    .filter(n => n !== 'Suriname')
    .sort((a, b) => a.localeCompare(b));

  console.log(`  → ${countries.length} countries`);
  return countries;
}

async function main() {
  const [suriname, countries] = await Promise.all([
    fetchSurinamePlaces(),
    fetchCountries(),
  ]);

  const outDir  = path.join(__dirname, '..', 'public', 'data');
  const outFile = path.join(outDir, 'locations.json');

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ suriname, countries }, null, 2), 'utf8');

  console.log(`\nSaved → ${outFile}`);
  console.log(`  Suriname : ${suriname.length} places`);
  console.log(`  Countries: ${countries.length}`);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
