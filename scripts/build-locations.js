#!/usr/bin/env node
/**
 * Build public/data/locations.json
 *
 * Sources:
 *   - Suriname populated places  → GeoNames free API (no key needed for demo)
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
    const req = https.get(url, { headers: { 'User-Agent': 'GuestTracker/1.0' } }, res => {
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
  // GeoNames free API — populated places in Suriname (country code SR)
  // Uses the public demo account (2000 req/hr limit — fine for a one-time run)
  const url = 'https://secure.geonames.org/searchJSON?country=SR&featureClass=P&maxRows=1000&orderby=population&username=demo';
  console.log('Fetching Suriname places from GeoNames…');
  const data = await get(url);

  if (!data.geonames) throw new Error(`GeoNames error: ${JSON.stringify(data)}`);

  const places = [
    ...new Set(
      data.geonames
        .map(p => p.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'nl'))
    ),
  ];

  console.log(`  → ${places.length} Suriname places`);
  return places;
}

async function fetchCountries() {
  console.log('Fetching country list from restcountries.com…');
  const data = await get('https://restcountries.com/v3.1/all?fields=name');

  const countries = data
    .map(c => c.name.common)
    .filter(n => n !== 'Suriname')   // Suriname is handled by its own list
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
