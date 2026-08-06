import tailwindcss from "@tailwindcss/vite";
import { presetIcons } from "@unocss/preset-icons";
import UnoCSS from "@unocss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { providerIconsPlugin } from "./provider-icons-plugin";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    UnoCSS({
      presets: [presetIcons()],
    }),
    providerIconsPlugin(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // Dedicated OMC ports — do not collide with OnMyAgent (5173 / 8787).
    port: 5180,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3100",
      "/docs": "http://127.0.0.1:3100",
      "/mcp": "http://127.0.0.1:3100",
      "/openapi.json": "http://127.0.0.1:3100",
      "/v1": "http://127.0.0.1:3100",
      "/health": "http://127.0.0.1:3100",
    },
  },
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/recharts/")) {
            return "charts";
          }
        },
      },
    },
  },
});
