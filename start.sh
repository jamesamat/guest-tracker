#!/bin/bash
set -e

# Start nginx as background daemon
nginx

# Run Node.js in foreground (PID 1 — container stays alive)
exec node /app/server.js
