<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Pre-Order & Dealer Exchange Tracker

A vehicle order tracking application for Priority Automotive with manager controls and user management.

View your app in AI Studio: https://ai.studio/apps/drive/1XrFhCIH0pgEmQ_DSYHkXD3TovOfqWFJu

## Features

- 🚗 Track vehicle pre-orders and dealer exchanges
- 👥 User management with role-based access control
- 📊 Dashboard with real-time statistics
- 🔔 Service worker with automatic update notifications
- 🎨 Optimized Tailwind CSS (no CDN in production)
- 📱 Responsive design for mobile and desktop
- 🔗 Deep linking support (e.g., `#settings` for direct access)

## Run Locally

**Prerequisites:** Node.js (v18 or higher recommended)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open your browser to `http://localhost:3000`

## Build and Deploy

### Build for Production

```bash
npm run build
```

This creates an optimized production build in the `dist/` directory with:
- Compiled and minified JavaScript
- Optimized CSS (Tailwind utilities tree-shaken)
- Service worker for offline support and caching
- Web app manifest for PWA support
- Version information (git commit SHA + build time)

### Build Output

```
dist/
├── index.html                    # Entry point (not cached long-term)
├── manifest.webmanifest          # PWA manifest
├── sw.js                         # Service worker
├── workbox-*.js                  # Workbox runtime
└── assets/
    ├── index-[hash].css          # Optimized CSS
    └── index-[hash].js           # Bundled JavaScript
```

### Deploy

The app can be deployed to any static hosting service:

- **Firebase Hosting**: `firebase deploy`
- **Netlify**: Drag and drop the `dist/` folder or connect your repo
- **Vercel**: Connect your GitHub repo with build command `npm run build`
- **GitHub Pages**: Use a deployment action to publish the `dist/` folder

**Important:** Ensure your hosting is configured to:
- Set `Cache-Control: no-cache` for `index.html` to allow service worker updates
- Allow longer caching for hashed assets (`assets/index-*.js`, `assets/index-*.css`)

### Service Worker Updates

The app includes automatic update detection:

1. **On new deployment**: The service worker detects a new version
2. **User notification**: A banner appears at the top: "A new version is available!"
3. **User action**: Click "Reload" to update, or "Dismiss" to continue with current version
4. **Version display**: Current version (git commit SHA) shown in the header

To verify the live version:
- Check the console for: `App Version: [commit-sha]` and `Build Time: [timestamp]`
- Look for version number next to "Vehicle Order Tracker" in the header

### Tailwind CSS Setup

The app uses Tailwind CSS via PostCSS (no CDN):

- **Configuration**: `tailwind.config.js`
- **PostCSS Config**: `postcss.config.js`
- **Source**: `src/index.css` (Tailwind directives)
- **Output**: Optimized CSS bundle with unused styles removed

**Production benefits:**
- ✅ No CDN warnings in console
- ✅ Faster initial load (no external script)
- ✅ Tree-shaking removes unused Tailwind utilities
- ✅ Consistent styling (no CDN version conflicts)

## Manager Features

Users designated as managers can:
- View all orders from all users
- Access the "User Management" settings page
- Toggle manager permissions for other users
- Cannot change their own role (security safeguard)

### Accessing User Management

1. **Pill navigation**: Click "User Management" in the header nav
2. **Gear icon**: Click the settings gear icon in the header
3. **Deep link**: Navigate to `#settings` in the URL

## Development Notes

### Hash-Based Routing

The app supports hash-based deep linking:
- `#dashboard` or `/` - Shows the dashboard view
- `#settings` - Opens user management (managers only)

### Version Information

- Version displayed in header: `v[commit-sha]`
- Hover over version to see build timestamp
- Console logs version info on app load

### Environment Variables

- `GEMINI_API_KEY` - Required for AI features
- Build-time variables are injected via Vite config

## Troubleshooting

### "User Management" buttons not visible

If manager UI is not showing:
1. Hard refresh the browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Clear service worker cache in DevTools > Application > Service Workers
3. Verify user has `isManager: true` in Firestore `users` collection
4. Check console for version - ensure latest build is loaded

### Service Worker Issues

To reset service worker:
1. Open DevTools > Application > Service Workers
2. Click "Unregister" for the current service worker
3. Click "Clear storage" to remove all caches
4. Hard refresh the page

### Stale Cache After Deploy

If users see old version after deployment:
1. Ensure `index.html` has short cache duration
2. Service worker will detect new version on next load
3. Update banner should appear automatically
4. Users can manually refresh if needed
