#!/bin/bash
set -e

# Generate nginx basic auth credentials using Node.js (always available)
node -e "
const crypto = require('crypto');
const fs     = require('fs');
const pass   = process.env.ADMIN_PASSWORD;
if (pass) {
  const hash = '{SHA}' + crypto.createHash('sha1').update(pass).digest('base64');
  fs.writeFileSync('/etc/nginx/.htpasswd', 'admin:' + hash + '\n');
} else {
  // Random hash — admin inaccessible if password not set
  const rand = crypto.randomBytes(16).toString('hex');
  const hash = '{SHA}' + crypto.createHash('sha1').update(rand).digest('base64');
  fs.writeFileSync('/etc/nginx/.htpasswd', 'admin:' + hash + '\n');
  process.stderr.write('WARNING: ADMIN_PASSWORD not set — admin access is disabled\n');
}
"

# Start nginx as background daemon
nginx

# Run Node.js in foreground (PID 1 — container stays alive)
exec node /app/server.js
