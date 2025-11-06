# Multi-stage Dockerfile for deterministic builds
# Stage 1: Build the application
FROM node:20-alpine AS builder

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
# Note: There's a known npm bug in some Docker environments that shows
# "Exit handler never called!" error. This typically doesn't occur in
# Cloud Build or production CI/CD pipelines. If you encounter this locally,
# try: docker build --network=host or upgrade Docker Desktop.
RUN npm ci --prefer-offline --no-audit

# Copy source code
COPY . .

# Build the application with version info
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:1.25-alpine

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built application from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
