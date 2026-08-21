import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "path";

export default defineConfig({
  // Relative base so the built site works from any GitHub Pages subpath
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        beta: resolve(__dirname, "beta.html"),
        betaTreats: resolve(__dirname, "beta-treats.html"),
      },
    },
  },
  server: {
    port: 5174,
    // Allow Cloudflare quick-tunnel hosts for shareable preview links
    allowedHosts: [".trycloudflare.com"],
  },
});
