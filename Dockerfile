# Multi-stage Dockerfile for deterministic builds
# 
# **IMPORTANT NOTE**: There is a known npm bug in Alpine Linux that causes
# "Exit handler never called!" errors. This Dockerfile is optimized for
# Google Cloud Build which does not encounter this issue. For local Docker
# builds, you may experience failures. The recommended approach is to build
# using Cloud Build: gcloud builds submit --config cloudbuild.yaml
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

# Install dependencies
# Note: npm in Alpine may show "Exit handler never called!" but succeeds in Cloud Build
RUN npm ci --prefer-offline --no-audit 2>&1 | tee /tmp/npm-install.log; \
    EXIT_CODE=$?; \
    if [ $EXIT_CODE -ne 0 ] && [ ! -d node_modules ]; then \
      echo "npm ci failed and node_modules not created"; \
      exit 1; \
    fi; \
    if [ ! -f node_modules/.bin/vite ]; then \
      echo "ERROR: vite not found after npm install"; \
      echo "This is a known issue with npm in Alpine Linux locally."; \
      echo "Please build using Cloud Build: gcloud builds submit --config cloudbuild.yaml"; \
      exit 1; \
    fi; \
    echo "✓ Dependencies installed successfully"

# Copy source code
COPY . .

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
RUN npm ci --only=production --prefer-offline --no-audit 2>&1 | tee /tmp/npm-prod-install.log; \
    EXIT_CODE=$?; \
    if [ $EXIT_CODE -ne 0 ] && [ ! -d node_modules ]; then \
      echo "npm ci production failed"; \
      exit 1; \
    fi

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
