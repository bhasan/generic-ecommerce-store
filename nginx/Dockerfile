# Stage 1: Build - Compile React app
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY web/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY web ./

# Build React app for production
RUN npm run build

# Stage 2: Runtime - Serve with Nginx
FROM nginx:1.25-alpine

# Copy custom Nginx configuration
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled React app from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Fix permissions for nginx user (already exists in nginx image)
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80 || exit 1

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
