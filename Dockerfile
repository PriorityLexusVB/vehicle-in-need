# Multi-stage Dockerfile for Cloud Build
# Produces valid OCI images with proper layer/diff_ids alignment
#
# ⚠️ IMPORTANT: Local Docker builds may fail due to npm bugs in Docker environments.
# This Dockerfile is optimized for Google Cloud Build. Use `gcloud builds submit` for production builds.
#
# Stage 1: Build the application
FROM node:20-alpine AS builder

# Set build arguments for version info (no API keys)
ARG COMMIT_SHA=unknown
ARG BUILD_TIME=unknown

# Expose as environment variables for Vite to access during build
ENV VITE_APP_COMMIT_SHA=$COMMIT_SHA
ENV VITE_APP_BUILD_TIME=$BUILD_TIME

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./

# Install dependencies - Cloud Build environment handles this reliably
# Note: Local Docker builds may encounter npm "Exit handler never called!" errors
# This is a known npm bug in Docker and doesn't occur in Cloud Build
# The fallback to `npm install` ensures build completes if npm ci encounters the bug
RUN npm ci --no-audit 2>&1 || npm install --no-audit

# Copy source code
COPY . .

# Run prebuild check for conflict markers (fail fast if present)
RUN npm run prebuild

# Build the application with version info
RUN npm run build

# Stage 2: Production runtime with Node.js
FROM node:20-alpine

# Set NODE_ENV to production
ENV NODE_ENV=production

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies only
COPY package.json package-lock.json ./
# Prefer npm ci for reproducible builds; fallback handles potential npm bug in Docker
RUN npm ci --omit=dev --no-audit 2>&1 || npm install --omit=dev --no-audit

# Copy server code
COPY server ./server

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Expose port 8080
EXPOSE 8080

# Set environment variable for version info
ARG COMMIT_SHA=unknown
ENV APP_VERSION=$COMMIT_SHA

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start the Node.js server
CMD ["node", "server/index.cjs"]
