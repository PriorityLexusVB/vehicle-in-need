# Multi-stage Dockerfile for deterministic builds
# Stage 1: Build the application
FROM node:20 AS builder

# Set build arguments for version info
ARG COMMIT_SHA=unknown
ARG BUILD_TIME=unknown

# Expose as environment variables for Vite to access during build
ENV VITE_APP_COMMIT_SHA=$COMMIT_SHA
ENV VITE_APP_BUILD_TIME=$BUILD_TIME

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./

# Clean install dependencies using package-lock.json
RUN npm ci

# Copy source code
COPY . .

# Build the application with version info
RUN npm run build

# Stage 2: Production runtime with Node.js
FROM node:20-slim

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy server code
COPY server ./server

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Expose port 8080
EXPOSE 8080

# Set environment variable for version info
ARG COMMIT_SHA=unknown
ENV APP_VERSION=$COMMIT_SHA

# Health check (using curl which is more commonly available)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start the Node.js server
CMD ["node", "server/index.cjs"]
