#!/usr/bin/env node
/**
 * Build public/data/locations.json
 *
 * Sources:
 *   - Suriname cities  → countriesnow.space (free, no key)
 *   - Country list     → restcountries.com  (free, no key)
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
        catch (e) { reject(new Error(`JSON parse failed: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const payload  = JSON.stringify(body);
    const urlObj   = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent':     'GuestTracker/1.0',
      },
    };
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(new Error(`JSON parse failed: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(payload);
    req.end();
  });
}

async function fetchSurinamePlaces() {
  console.log('Fetching Suriname cities from countriesnow.space…');
  const data = await post('https://countriesnow.space/api/v0.1/countries/cities', { country: 'Suriname' });

  if (data.error) throw new Error(`countriesnow error: ${data.msg}`);

  const places = (data.data || [])
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'nl'));

  console.log(`  → ${places.length} Suriname places`);
  return places;
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
