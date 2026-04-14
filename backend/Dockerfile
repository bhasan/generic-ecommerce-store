# Stage 1: Builder with dependencies
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies (slim includes some by default)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npx prisma generate && npm run build

# Stage 2: Runtime - minimal image with only production dependencies
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install production dependencies only (alpine with wget for health checks)
RUN apk add --no-cache wget && npm ci --omit=dev

# Copy Prisma schema from builder (for migrations)
COPY --from=builder /app/prisma ./prisma
RUN npx prisma generate

# Copy compiled application from builder
COPY --from=builder /app/dist ./dist

# Create uploads directory with proper permissions
RUN mkdir -p /app/uploads && chown -R 1001:1001 /app/uploads

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["npm", "run", "start:prod"]
