# ==============================================================================
# TraceGrid API Service - Production/Staging Dockerfile
# Multi-stage build with non-root security and health monitoring.
# ==============================================================================

# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN npm ci --ignore-scripts

# Copy API source and Prisma definitions
COPY apps/api ./apps/api

RUN npm run prisma:generate --workspace=@tracegrid/api

# Compile TypeScript
RUN npm run build --workspace=@tracegrid/api

# Stage 2: Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

# Install runtime utilities (curl for container healthcheck)
RUN apk add --no-cache curl dumb-init

ENV NODE_ENV=production
ENV PORT=5000

# Copy root package files
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install only production dependencies
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled application code and Prisma artifacts from builder
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Create storage directory for evidence and persistent revocation
RUN mkdir -p /app/storage/evidence && chown -R node:node /app

# Switch to non-root unprivileged user
USER node

EXPOSE 5000

# Health check verifies operational response
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:5000/api/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "apps/api/dist/server.js"]
