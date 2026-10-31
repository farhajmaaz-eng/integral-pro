FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git bash ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
  && mkdir -p /app/data \
  && chown -R node:node /app

USER node

ENV NODE_ENV=production \
    PORT=8787 \
    DATA_DIR=/app/data

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok||r.status===401?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "server/index.ts"]
