import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.SITE_BASE_PATH || "/",
  server: {
    port: 4173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    manifest: true,
    reportCompressedSize: false,
  },
  plugins: [react()],
});
