import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      registerType: "prompt",
      srcDir: "src",
      filename: "sw.ts",
      manifest: false, // We use public/manifest.webmanifest directly
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@asset-hub/core-offline": path.resolve(__dirname, "../../packages/core-offline/src/index.ts"),
    },
  },
  optimizeDeps: {
    exclude: ["@asset-hub/core-offline"],
  },
  server: {
    port: 5174,
  },
});

