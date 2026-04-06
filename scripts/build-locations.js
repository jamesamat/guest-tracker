#!/usr/bin/env node
/**
 * Build public/data/locations.json
 *
 * Suriname places: tries countriesnow.space, falls back to built-in list
 * Countries:       restcountries.com (free, no key)
 *
 * Run once (or whenever you want fresh data):
 *   node scripts/build-locations.js
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ── Hardcoded fallback — covers all districts/resorts ────────────────────────
const SURINAME_FALLBACK = [
  'Afobaka', 'Albina', 'Alkmaar', 'Amy', 'Apoera',
  'Bigiston', 'Brokopondo', 'Brownsweg',
  'Carolina', 'Coeroeni', 'Coronie', 'Cottica',
  'Domburg',
  'Flora', 'Friendship',
  'Groningen', 'Groot Henar',
  'Kabalebo', 'Kwatta', 'Kwakoegron',
  'Langatabbetje', 'Lelydorp',
  'Marienburg', 'Marshallkreek', 'Meerzorg', 'Moengo',
  'Nieuw Amsterdam', 'Nieuw Nickerie',
  'Onverwacht',
  'Para', 'Paramaribo', 'Patamacca',
  'Rainville', 'Republiek',
  'Sara Kreek', 'Saramacca',
  'Tamanredjo', 'Tapanahony', 'Tijgerkreek', 'Totness', 'Tout Lui Faut',
  'Uitkijk',
  'Wageningen', 'Wanica', 'Wanhatti', 'Wayambo',
  'Zanderij',
].sort((a, b) => a.localeCompare(b, 'nl'));

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
      // Follow redirects
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

// ── Suriname places ──────────────────────────────────────────────────────────
async function fetchSurinamePlaces() {
  try {
    console.log('Fetching Suriname cities from countriesnow.space…');
    const data = await request('POST', 'https://countriesnow.space/api/v0.1/countries/cities', { country: 'Suriname' });

    if (data.error || !Array.isArray(data.data) || data.data.length === 0) {
      throw new Error(data.msg || 'empty response');
    }

    // Merge API results with fallback to maximise coverage
    const merged = [...new Set([...data.data, ...SURINAME_FALLBACK])]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'nl'));

    console.log(`  → ${merged.length} places (API ${data.data.length} + fallback ${SURINAME_FALLBACK.length}, merged)`);
    return merged;

  } catch (err) {
    console.warn(`  ! API failed (${err.message}) — using built-in list`);
    console.log(`  → ${SURINAME_FALLBACK.length} places (built-in fallback)`);
    return SURINAME_FALLBACK;
  }
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
