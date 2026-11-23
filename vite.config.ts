import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api/smartflo": {
        target: "https://api-smartflo.tatateleservices.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/smartflo/, ""),
        secure: false,
      },
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'smartflo-recording-proxy',
      configureServer(server) {
        server.middlewares.use('/api/recording', async (req, res) => {
          try {
            const { default: handler } = await import('./api/recording.js');
            const host = req.headers.host || 'localhost:8080';
            const fullUrl = new URL(req.url || '', `http://${host}`);
            (req as any).query = Object.fromEntries(fullUrl.searchParams.entries());
            await handler(req, res);
          } catch (e) {
            console.error('Vite recording proxy middleware error:', e);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Proxy error' }));
          }
        });
      },
    },
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "robots.txt", "apple-touch-icon.png"],
      manifest: {
        name: "VT CRM",
        short_name: "VT CRM",
        description: "Vakiltech CRM for internal lead management",
        theme_color: "#ffffff",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      // Import the custom service worker for push notification handling
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        importScripts: ["custom-sw.js"],
      },
    }),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));