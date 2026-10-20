# ==============================================================================
# TraceGrid Web Client - Production/Staging Dockerfile
# Multi-stage build with unprivileged Nginx web server and SPA reverse proxy.
# ==============================================================================

# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN npm ci --ignore-scripts

# Copy frontend source and configuration
COPY apps/web ./apps/web

# Build optimized production bundle
RUN npm run build --workspace=@tracegrid/web

# Stage 2: Runtime stage using unprivileged Nginx
FROM nginxinc/nginx-unprivileged:alpine AS runner

# Copy custom Nginx configuration
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Expose unprivileged HTTP port
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
