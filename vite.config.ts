import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
// Get git commit SHA and build time
const getGitCommitSha = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
};

const getBuildTime = () => {
  return new Date().toISOString();
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // Use VITE_APP_* env vars if available (set by Docker), otherwise fall back to git
  const commitSha = env.VITE_APP_COMMIT_SHA || getGitCommitSha();
  const buildTime = env.VITE_APP_BUILD_TIME || getBuildTime();

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      nodePolyfills({
        // To make getRandomValues work correctly
        protocolImports: true,
      }),
      react(),
      VitePWA({
        registerType: 'prompt',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
          navigateFallback: null, // Don't cache index.html indefinitely
        },
        manifest: {
          name: 'Pre-Order & Dealer Exchange Tracker',
          short_name: 'Vehicle Tracker',
          description: 'Track vehicle pre-orders and dealer exchanges',
          theme_color: '#0ea5e9',
          icons: [],
        },
      }),
    ],
    define: {
      '__APP_VERSION__': JSON.stringify(commitSha),
      '__BUILD_TIME__': JSON.stringify(buildTime),
      // Also expose via import.meta.env for VersionBadge
      'import.meta.env.VITE_APP_COMMIT_SHA': JSON.stringify(commitSha),
      'import.meta.env.VITE_APP_BUILD_TIME': JSON.stringify(buildTime),
      // Note: VITE_GEMINI_API_KEY is automatically exposed by Vite via import.meta.env
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
