#!/usr/bin/env node
/**
 * Build public/data/locations.json
 *
 * Suriname: hardcoded district→resort mapping (stable admin data)
 * Countries: restcountries.com (free, no key) — refreshed on each run
 *
 * Run once (or whenever you want a fresh country list):
 *   node scripts/build-locations.js
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ── Suriname districts and their resorts ─────────────────────────────────────
const SURINAME_DISTRICTS = {
  Brokopondo: ['Afobaka', 'Bigiston', 'Brokopondo', 'Brownsweg', 'Kwakoegron'],
  Commewijne: ['Alkmaar', 'Amy', 'Friendship', 'Mariënburg', 'Meerzorg', 'Nieuw Amsterdam', 'Tamanredjo'],
  Coronie:    ['Coronie', 'Totness'],
  Marowijne:  ['Albina', 'Cottica', 'Moengo', 'Patamacca'],
  Nickerie:   ['Kabalebo', 'Nieuw Nickerie', 'Wageningen'],
  Para:       ['Carolina', 'Flora', 'Onverwacht', 'Para', 'Republiek', 'Sara Kreek', 'Zanderij'],
  Paramaribo: ['Paramaribo'],
  Saramacca:  ['Groningen', 'Groot Henar', 'Saramacca', 'Uitkijk', 'Wayambo'],
  Sipaliwini: ['Apoera', 'Botopasi', 'Coeroeni', 'Langatabbetje', 'Marshallkreek', 'Tapanahony', 'Tijgerkreek', 'Tout Lui Faut', 'Wanhatti'],
  Wanica:     ['Domburg', 'Kwatta', 'Lelydorp', 'Rainville', 'Wanica'],
};

// ── HTTP/S helper with redirect following ────────────────────────────────────
function request(method, url, body, hops = 0) {
  if (hops > 5) return Promise.reject(new Error('Too many redirects'));

  return new Promise((resolve, reject) => {
    const urlObj  = new URL(url);
    const lib     = urlObj.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const opts    = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method,
      headers: {
        'User-Agent': 'GuestTracker/1.0',
        ...(payload && {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(payload),
        }),
      },
    };

    const req = lib.request(opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : `${urlObj.protocol}//${urlObj.hostname}${res.headers.location}`;
        res.resume();
        return request('GET', next, null, hops + 1).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(new Error(`JSON parse failed: ${e.message}`)); }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Countries ────────────────────────────────────────────────────────────────
async function fetchCountries() {
  console.log('Fetching country list from restcountries.com…');
  const data = await request('GET', 'https://restcountries.com/v3.1/all?fields=name');

  const countries = data
    .map(c => c.name.common)
    .filter(n => n !== 'Suriname')
    .sort((a, b) => a.localeCompare(b));

  console.log(`  → ${countries.length} countries`);
  return countries;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const countries = await fetchCountries();

  const totalResorts = Object.values(SURINAME_DISTRICTS)
    .reduce((s, r) => s + r.length, 0);

  console.log(`  Suriname: ${Object.keys(SURINAME_DISTRICTS).length} districts, ${totalResorts} resorts`);

  const outDir  = path.join(__dirname, '..', 'public', 'data');
  const outFile = path.join(outDir, 'locations.json');

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(
    { suriname: { districts: SURINAME_DISTRICTS }, countries },
    null, 2
  ), 'utf8');

  console.log(`\nSaved → ${outFile}`);
  console.log(`  Districts: ${Object.keys(SURINAME_DISTRICTS).length}`);
  console.log(`  Countries: ${countries.length}`);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
