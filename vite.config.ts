import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";

// Relative build assets work at / and /repository/. Navigation uses hashes.
export default defineConfig({
  plugins: [
    react(),
    {
      name: "private-local-catalog",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use(
          "/__private/course-catalog",
          async (req, res) => {
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
            res.setHeader("Content-Type", "application/json");
            const host = req.headers.host || "";
            if (
              !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ||
              (req.headers.origin && req.headers.origin !== `http://${host}`)
            ) {
              res.statusCode = 403;
              res.end();
              return;
            }
            if (req.method !== "GET") {
              res.statusCode = 405;
              res.end();
              return;
            }
            try {
              res.end(
                await readFile(
                  new URL("./private/course-catalog.json", import.meta.url),
                  "utf8",
                ),
              );
            } catch {
              res.statusCode = 404;
              res.end("{}");
            }
          },
        );
      },
    },
  ],
  server: {
    fs: {
      deny: [".env", ".env.*", "**/.git/**", "**/private/**", "**/backups/**"],
    },
  },
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          temporal: ["@js-temporal/polyfill"],
          validation: ["zod"],
          react: ["react", "react-dom"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
