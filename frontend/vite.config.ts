import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwind()],
  // Discover lazy PDF dependencies at startup; a first export must not reload the editor.
  optimizeDeps: { include: ["jspdf", "svg2pdf.js"] },
  server: {
    proxy: { "/api": "http://127.0.0.1:8086" },
    watch: { ignored: ["**/playwright-report/**", "**/test-results/**"] },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
