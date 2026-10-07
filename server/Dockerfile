# ==============================================================================
# AI Workforce Platform — Backend Dockerfile (API & Worker)
# Phase 21: Multi-Stage Production Containerization
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Stage
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies deterministically
COPY package*.json ./
RUN npm ci

# Copy TypeScript configuration and application source
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript to JavaScript in /app/dist
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime Stage
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Install curl for reliable container health checks
RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=3000

# Install production-only dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled artifacts from builder
COPY --from=builder /app/dist ./dist

# Security: Run as unprivileged non-root 'node' user
USER node

# Expose backend service port
EXPOSE 3000

# Container Healthcheck (API readiness)
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Default entrypoint runs Express API (can be overridden by Compose for Worker)
CMD ["node", "dist/server.js"]
