#!/bin/bash
set -e

# Generate nginx basic auth credentials for /admin.html
if [ -n "$ADMIN_PASSWORD" ]; then
    echo "admin:$(openssl passwd -apr1 "$ADMIN_PASSWORD")" > /etc/nginx/.htpasswd
else
    # No password configured — generate a random one so nginx starts but admin is inaccessible
    echo "admin:$(openssl passwd -apr1 "$(openssl rand -hex 16)")" > /etc/nginx/.htpasswd
    echo "WARNING: ADMIN_PASSWORD not set — admin access is disabled" >&2
fi

# Start nginx as background daemon
nginx

# Run Node.js in foreground (PID 1 — container stays alive)
exec node /app/server.js
