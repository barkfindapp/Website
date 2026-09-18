import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "path";

export default defineConfig({
  // Absolute base for the Vercel root-domain deploy. Required so prerendered
  // sub-pages (e.g. /treats/index.html) reference /assets/... rather than a
  // path relative to the sub-folder, which would 404.
  base: "/",
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
