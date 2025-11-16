FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --prefer-offline --no-audit 2>&1 || true
RUN ls -la node_modules/.bin/vite && echo "vite exists!" || echo "vite missing!"
