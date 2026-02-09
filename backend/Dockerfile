# -----------------------------------------------------------------------------
# Stage 1: Build (dev deps + compile + Prisma generate)
# -----------------------------------------------------------------------------
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Production runtime (no dev deps, smaller image)
# -----------------------------------------------------------------------------
FROM node:18-alpine

WORKDIR /app

# Production deps; add Prisma for migrate + seed
COPY package*.json ./
RUN npm ci --omit=dev && npm install prisma --save

# Prisma schema + migrations (needed for generate and migrate deploy)
COPY --from=builder /app/prisma ./prisma
RUN npx prisma generate

# Compiled app
COPY --from=builder /app/dist ./dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Migrate DB then start (or run migrate separately and use "node dist/index.js")
CMD [ "npm", "run", "start:prod" ]