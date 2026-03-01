FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js 20 + nginx in one layer
RUN apt-get update && \
    apt-get install -y curl nginx && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm install --omit=dev

# Copy app files
COPY server.js ./
COPY public/ ./public/

# nginx: proxy port 41080 → node on 3000
COPY nginx.conf /etc/nginx/sites-available/guest-tracker
RUN ln -sf /etc/nginx/sites-available/guest-tracker \
           /etc/nginx/sites-enabled/guest-tracker && \
    rm -f /etc/nginx/sites-enabled/default

COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 41080

CMD ["/start.sh"]
