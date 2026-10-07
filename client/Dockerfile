# ==============================================================================
# AI Workforce Platform — Frontend Client Dockerfile
# Phase 21: Multi-Stage Production React Web Container
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Stage
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies deterministically
COPY package*.json ./
RUN npm ci

# Copy application source
COPY . .

# Compile production Vite bundle into /app/dist
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Nginx Web Server Stage
# ------------------------------------------------------------------------------
FROM nginx:alpine AS runner

# Remove default Nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy custom Nginx configuration with /api reverse proxy and SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy production client bundle from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose web server port
EXPOSE 80

# Container Healthcheck (Nginx /healthz readiness)
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/healthz || exit 1

# Start Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
