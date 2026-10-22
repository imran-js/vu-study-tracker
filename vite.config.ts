import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative build assets work at / and /repository/. Navigation uses hashes.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          temporal: ["@js-temporal/polyfill"],
          validation: ["zod"],
        },
      },
    },
  },
});
